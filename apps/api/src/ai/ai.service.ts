import { Injectable, Inject, Optional } from "@nestjs/common";
import { and, desc, eq, gte, ilike, isNull, or, sql } from "drizzle-orm";
import { schema, type Database } from "@pm/db";
import { AppError } from "@pm/shared";
import { DB } from "../db/db.module.js";
import { ModulesService } from "../modules/modules.service.js";
import { WorkItemsService } from "../work/work-items.service.js";
import { canAccessProject, canAccessWorkItem } from "../collab/access.js";
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


  private async consumeTokens(org: string, settings: { id: string; usedTokens: number; budgetTokens: number }, tokens: number) {
    if (!tokens) return;
    const [updated] = await this.db.update(schema.aiSettings).set({
      usedTokens: sql`${schema.aiSettings.usedTokens} + ${tokens}`,
      updatedAt: new Date(),
    }).where(and(
      eq(schema.aiSettings.id, settings.id),
      eq(schema.aiSettings.organizationId, org),
      sql`${schema.aiSettings.usedTokens} + ${tokens} <= ${schema.aiSettings.budgetTokens}`,
    )).returning({ id: schema.aiSettings.id });
    if (!updated) throw new AppError("RATE_LIMITED", "AI usage budget exceeded", { code: "budget_exceeded" });
  }

  async projectSummary(org: string, userId: string, projectId: string) {
    await this.enabled(org);
    if (!await canAccessProject(this.db, org, projectId, userId)) throw new AppError("FORBIDDEN", "Project not accessible");
    const [row] = await this.db.select().from(schema.projectAiSummarySettings).where(and(eq(schema.projectAiSummarySettings.organizationId, org), eq(schema.projectAiSummarySettings.projectId, projectId))).limit(1);
    if (row) return row;
    const [created] = await this.db.insert(schema.projectAiSummarySettings).values({ organizationId: org, projectId }).returning();
    return created;
  }

  async updateProjectSummary(org: string, userId: string, projectId: string, patch: { includeSources?: boolean; includeRiskReport?: boolean; regularUpdates?: boolean; timeframe?: string }) {
    const current = await this.projectSummary(org, userId, projectId);
    const [row] = await this.db.update(schema.projectAiSummarySettings).set({ ...patch, updatedAt: new Date() }).where(eq(schema.projectAiSummarySettings.id, current.id)).returning();
    await this.audit(org, userId, "project_summary_settings", { projectId, ...patch });
    return row;
  }

  async generateProjectSummary(org: string, userId: string, projectId: string) {
    const pref = await this.projectSummary(org, userId, projectId);
    const [project] = await this.db.select().from(schema.projects).where(and(eq(schema.projects.id, projectId), eq(schema.projects.organizationId, org))).limit(1);
    if (!project) throw new AppError("NOT_FOUND", "Project not found");
    const tasks = await this.db.select({ key: schema.workItems.key, title: schema.workItems.title, statusCategory: schema.workItems.statusCategory, dueDate: schema.workItems.dueDate })
      .from(schema.workItems).where(and(eq(schema.workItems.organizationId, org), eq(schema.workItems.owningProjectId, projectId), isNull(schema.workItems.deletedAt))).limit(300);
    const updates = await this.db.select().from(schema.projectStatusUpdates).where(and(eq(schema.projectStatusUpdates.organizationId, org), eq(schema.projectStatusUpdates.projectId, projectId))).orderBy(desc(schema.projectStatusUpdates.createdAt)).limit(10);
    const done = tasks.filter((x) => x.statusCategory === "done").length;
    const overdue = tasks.filter((x) => x.dueDate && new Date(x.dueDate) < new Date() && x.statusCategory !== "done").length;
    const lines = [
      `Project: ${project.name}`,
      `Description: ${project.description || "No description"}`,
      `Status: ${project.status}; health: ${project.health}`,
      `Tasks: ${tasks.length}; completed: ${done}; overdue: ${overdue}`,
      `Recent status updates: ${updates.map((u) => `${u.health}: ${u.title} ${u.body || ""}`).join(" | ") || "none"}`,
      pref.includeRiskReport ? `Risk facts: ${overdue} overdue tasks; project health ${project.health}.` : "",
      pref.includeSources ? `Sources: project record, ${tasks.length} current work items, ${updates.length} recent status updates.` : "",
      "Summarize current progress, next attention areas, and factual risks. Do not invent missing information.",
    ].filter(Boolean);
    const fallback = `${project.name}: ${done} of ${tasks.length} tasks are complete; ${overdue} are overdue. Project health is ${project.health}. ${updates[0] ? `Latest update: ${updates[0].title}.` : "No status update has been posted yet."}`;
    let text = fallback, tokens = 0, degraded = false;
    try { const out = await this.provider.summarize(lines.join("\n")); text = out.text; tokens = out.tokens; } catch { degraded = true; }
    const settings = await this.settings(org);
    await this.consumeTokens(org, settings, tokens);
    const [row] = await this.db.update(schema.projectAiSummarySettings).set({ summary: text, generatedAt: new Date(), generatedBy: userId, updatedAt: new Date() }).where(eq(schema.projectAiSummarySettings.id, pref.id)).returning();
    await this.audit(org, userId, "project_summary_generate", { projectId, degraded, tokens });
    return { ...row, degraded };
  }

  async inboxSummary(org: string, userId: string, timeframe: "day" | "week" | "month" = "week") {
    await this.enabled(org);
    const prefs = await this.db.select().from(schema.userUiPreferences).where(and(eq(schema.userUiPreferences.organizationId, org), eq(schema.userUiPreferences.userId, userId))).limit(1);
    if (prefs[0] && !prefs[0].inboxSummaryEnabled) return { enabled: false, timeframe, summary: null, counts: {} };
    const days = timeframe === "day" ? 1 : timeframe === "month" ? 30 : 7;
    const since = new Date(Date.now() - days * 86_400_000);
    const rows = await this.db.select().from(schema.notifications).where(and(eq(schema.notifications.organizationId, org), eq(schema.notifications.recipientUserId, userId), gte(schema.notifications.createdAt, since))).orderBy(desc(schema.notifications.createdAt)).limit(250);
    const counts = rows.reduce<Record<string, number>>((acc, row) => { acc[row.type] = (acc[row.type] || 0) + 1; return acc; }, {});
    const unread = rows.filter((x) => !x.readAt).length;
    const prompt = `Inbox timeframe: last ${days} day(s). Total notifications: ${rows.length}. Unread: ${unread}. Types: ${Object.entries(counts).map(([k,v])=>`${k}=${v}`).join(", ") || "none"}. Summarize what needs attention without inventing details.`;
    let summary = rows.length ? `${unread} unread of ${rows.length} notifications in the selected period.` : "No notifications in the selected period.";
    let degraded = false, tokens = 0;
    if (rows.length) try { const out = await this.provider.summarize(prompt); summary = out.text; tokens = out.tokens; } catch { degraded = true; }
    const settings = await this.settings(org);
    await this.consumeTokens(org, settings, tokens);
    await this.audit(org, userId, "inbox_summary", { timeframe, count: rows.length, degraded });
    return { enabled: true, timeframe, summary, counts, unread, degraded };
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

    await this.consumeTokens(org, settings, tokens);

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
