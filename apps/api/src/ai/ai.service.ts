import { Injectable, Inject, Optional } from "@nestjs/common";
import { and, desc, eq, ilike, isNull, or } from "drizzle-orm";
import { schema, type Database } from "@pm/db";
import { AppError } from "@pm/shared";
import { DB } from "../db/db.module.js";
import { ModulesService } from "../modules/modules.service.js";
import { WorkItemsService } from "../work/work-items.service.js";
import { canAccessWorkItem } from "../collab/access.js";
import { AI_PROVIDER, type AiProvider, type Citation } from "./provider.js";

@Injectable()
export class AiService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly modules: ModulesService,
    @Inject(AI_PROVIDER) private readonly provider: AiProvider,
    @Optional() private readonly workItems?: WorkItemsService,
  ) {}

  private enabled(org: string) { return this.modules.assertEnabled(org, "ai"); }
  private audit(org: string, userId: string | null, event: string, detail: object) {
    return this.db.insert(schema.aiAuditLog).values({ organizationId: org, userId, event, detail });
  }
  private async settings(org: string) {
    const [row] = await this.db.select().from(schema.aiSettings).where(eq(schema.aiSettings.organizationId, org)).limit(1);
    if (row) return row;
    const [created] = await this.db.insert(schema.aiSettings).values({ organizationId: org }).returning();
    return created;
  }

  /** Permission-aware retrieval: returns ONLY items the user can access, with source refs. */
  async retrieve(org: string, userId: string, query: string): Promise<Citation[]> {
    await this.enabled(org);
    const words = Array.from(new Set(query.split(/\W+/).filter((w) => w.length >= 4)));
    if (!words.length) { await this.audit(org, userId, "retrieval", { query, returned: 0, scanned: 0 }); return []; }
    const candidates = await this.db.select({ id: schema.workItems.id, key: schema.workItems.key, title: schema.workItems.title })
      .from(schema.workItems).where(and(eq(schema.workItems.organizationId, org), isNull(schema.workItems.deletedAt), or(...words.map((wd) => ilike(schema.workItems.title, `%${wd}%`))))).limit(50);
    const allowed: Citation[] = [];
    for (const c of candidates) if (await canAccessWorkItem(this.db, org, c.id, userId)) allowed.push({ kind: "work_item", id: c.id, key: c.key });
    await this.audit(org, userId, "retrieval", { query, returned: allowed.length, scanned: candidates.length });
    return allowed;
  }

  /** Draft a task proposal. Never mutates; degrades gracefully if the provider is down. */
  async proposeTask(org: string, userId: string, input: { projectId: string; text: string; useRetrieval?: boolean }) {
    await this.enabled(org);
    const settings = await this.settings(org);
    const citations = input.useRetrieval ? await this.retrieve(org, userId, input.text) : [];

    let title: string, tokens = 0, degraded = false;
    try {
      const draft = await this.provider.draftTitle(input.text, citations);
      title = draft.title; tokens = draft.tokens;
    } catch { title = input.text.slice(0, 80) || "Untitled"; degraded = true; } // graceful degradation

    if (settings.usedTokens + tokens > settings.budgetTokens) throw new AppError("RATE_LIMITED", "AI usage budget exceeded", { code: "budget_exceeded" });
    if (tokens) await this.db.update(schema.aiSettings).set({ usedTokens: settings.usedTokens + tokens, updatedAt: new Date() }).where(eq(schema.aiSettings.id, settings.id));

    const [proposal] = await this.db.insert(schema.aiActionProposals).values({ organizationId: org, userId, kind: "create_task", title, payload: { projectId: input.projectId, sourceText: input.text }, citations, degraded }).returning();
    await this.audit(org, userId, "propose", { proposalId: proposal.id, degraded, citations: citations.length });
    return proposal; // proposed only — no work item yet
  }

  /** Explicit human confirmation applies the mutation and logs the action. */
  async confirmProposal(org: string, userId: string, proposalId: string) {
    await this.enabled(org);
    if (!this.workItems) throw new AppError("VALIDATION", "Work item service unavailable");
    const [p] = await this.db.select().from(schema.aiActionProposals).where(and(eq(schema.aiActionProposals.id, proposalId), eq(schema.aiActionProposals.organizationId, org))).limit(1);
    if (!p) throw new AppError("NOT_FOUND", "Proposal not found");
    if (p.status !== "proposed") throw new AppError("CONFLICT", `Proposal already ${p.status}`);
    const projectId = (p.payload as { projectId: string }).projectId;
    const item = await this.workItems.create(org, userId, { projectId, title: p.title });
    await this.db.update(schema.aiActionProposals).set({ status: "applied", createdWorkItemId: item.id, decidedAt: new Date() }).where(eq(schema.aiActionProposals.id, proposalId));
    await this.audit(org, userId, "apply", { proposalId, workItemId: item.id });
    return { applied: true, workItem: item };
  }

  async rejectProposal(org: string, userId: string, proposalId: string) {
    await this.enabled(org);
    const [p] = await this.db.update(schema.aiActionProposals).set({ status: "rejected", decidedAt: new Date() })
      .where(and(eq(schema.aiActionProposals.id, proposalId), eq(schema.aiActionProposals.organizationId, org), eq(schema.aiActionProposals.status, "proposed"))).returning();
    if (!p) throw new AppError("NOT_FOUND", "Open proposal not found");
    await this.audit(org, userId, "reject", { proposalId });
    return { rejected: true };
  }

  async listProposals(org: string) { await this.enabled(org); return this.db.select().from(schema.aiActionProposals).where(eq(schema.aiActionProposals.organizationId, org)).orderBy(desc(schema.aiActionProposals.createdAt)); }
  async auditTrail(org: string) { await this.enabled(org); return this.db.select().from(schema.aiAuditLog).where(eq(schema.aiAuditLog.organizationId, org)).orderBy(desc(schema.aiAuditLog.at)).limit(100); }
  async status(org: string) { await this.enabled(org); const s = await this.settings(org); return { provider: this.provider.name, healthy: this.provider.healthy(), budgetTokens: s.budgetTokens, usedTokens: s.usedTokens }; }
}
