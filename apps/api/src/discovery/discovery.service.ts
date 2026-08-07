import { Injectable, Inject } from "@nestjs/common";
import { and, eq, gt, inArray, isNull, or, sql } from "drizzle-orm";
import { schema, type Database } from "@pm/db";
import { AppError } from "@pm/shared";
import { DB } from "../db/db.module.js";
import { ModulesService } from "../modules/modules.service.js";
import { canAccessProject, canAccessWorkItem } from "../collab/access.js";
import { issueToken, sha256 } from "../common/crypto.js";
import { scoreIdea } from "./prioritisation.js";

@Injectable()
export class DiscoveryService {
  constructor(@Inject(DB) private readonly db: Database, private readonly modules: ModulesService) {}
  private enabled(org: string) { return this.modules.assertEnabled(org, "discovery"); }

  async overview(org: string) {
    await this.enabled(org);
    const [ideas, insights, formulas, publications] = await Promise.all([
      this.db.select().from(schema.ideas).where(eq(schema.ideas.organizationId, org)),
      this.db.select().from(schema.insights).where(eq(schema.insights.organizationId, org)),
      this.db.select().from(schema.prioritisationFormulas).where(eq(schema.prioritisationFormulas.organizationId, org)),
      this.db.select().from(schema.roadmapPublications).where(eq(schema.roadmapPublications.organizationId, org)),
    ]);
    return { ideas, insights, formulas, publications, metrics: { ideas: ideas.length, evidence: insights.length, linkedEvidence: (await this.db.select().from(schema.ideaInsights).where(eq(schema.ideaInsights.organizationId, org))).length, selected: ideas.filter((i) => ["planned", "selected", "in_delivery"].includes(i.status)).length } };
  }

  async createCustomer(org: string, input: { name: string; externalRef?: string; segment?: string; weight?: number; consentStatus?: string; retentionUntil?: string; metadata?: Record<string, unknown> }) {
    await this.enabled(org);
    const [row] = await this.db.insert(schema.discoveryCustomers).values({ organizationId: org, name: input.name, externalRef: input.externalRef, segment: input.segment, weight: input.weight ?? 1, consentStatus: input.consentStatus ?? "unknown", retentionUntil: input.retentionUntil ? new Date(input.retentionUntil) : null, metadata: input.metadata ?? {} }).returning();
    return row;
  }

  async createIdea(org: string, userId: string, input: { parentIdeaId?: string; kind?: string; title: string; description?: string; ownerUserId?: string; impact?: number; confidence?: number; effort?: number; reach?: number; customerWeight?: number; tags?: string[] }) {
    await this.enabled(org);
    const values = { impact: input.impact ?? 0, confidence: input.confidence ?? 0, effort: Math.max(0.01, input.effort ?? 1), reach: input.reach ?? 0, customerWeight: input.customerWeight ?? 1 };
    const score = scoreIdea("rice", values);
    const [row] = await this.db.insert(schema.ideas).values({ organizationId: org, parentIdeaId: input.parentIdeaId, kind: input.kind ?? "idea", title: input.title, description: input.description, ownerUserId: input.ownerUserId ?? userId, ...values, score, tags: input.tags ?? [], createdByUserId: userId }).returning();
    return row;
  }

  async captureInsight(org: string, userId: string, input: { customerId?: string; sourceType: string; sourceRef?: string; title: string; body: string; theme?: string; private?: boolean; metadata?: Record<string, unknown>; ideaIds?: string[] }) {
    await this.enabled(org);
    const dedupeHash = sha256(`${input.sourceType}\n${input.sourceRef ?? ""}\n${input.title.trim().toLowerCase()}\n${input.body.trim().toLowerCase()}`);
    const existing = await this.db.select().from(schema.insights).where(and(eq(schema.insights.organizationId, org), eq(schema.insights.dedupeHash, dedupeHash))).limit(1).then((r) => r[0]);
    if (existing) return { insight: existing, duplicate: true };
    const [row] = await this.db.insert(schema.insights).values({ organizationId: org, customerId: input.customerId, sourceType: input.sourceType, sourceRef: input.sourceRef, title: input.title, body: input.body, theme: input.theme, dedupeHash, private: input.private ?? false, metadata: input.metadata ?? {}, createdByUserId: userId }).returning();
    for (const ideaId of input.ideaIds ?? []) await this.db.insert(schema.ideaInsights).values({ organizationId: org, ideaId, insightId: row.id }).onConflictDoNothing();
    return { insight: row, duplicate: false };
  }

  async linkInsight(org: string, ideaId: string, insightId: string, relevance = 1) {
    await this.enabled(org);
    const [row] = await this.db.insert(schema.ideaInsights).values({ organizationId: org, ideaId, insightId, relevance }).onConflictDoNothing().returning();
    return row ?? { ideaId, insightId, relevance };
  }

  async vote(org: string, userId: string, ideaId: string, value: number) {
    await this.enabled(org);
    const existing = await this.db.select().from(schema.discoveryVotes).where(and(eq(schema.discoveryVotes.organizationId, org), eq(schema.discoveryVotes.ideaId, ideaId), eq(schema.discoveryVotes.userId, userId))).limit(1).then((r) => r[0]);
    if (existing) return (await this.db.update(schema.discoveryVotes).set({ value }).where(eq(schema.discoveryVotes.id, existing.id)).returning())[0];
    return (await this.db.insert(schema.discoveryVotes).values({ organizationId: org, ideaId, userId, value }).returning())[0];
  }

  async createFormula(org: string, userId: string, input: { name: string; kind: "rice" | "wsjf" | "weighted"; weights?: Record<string, number> }) {
    await this.enabled(org);
    const [row] = await this.db.insert(schema.prioritisationFormulas).values({ organizationId: org, name: input.name, kind: input.kind, weights: input.weights ?? {}, createdByUserId: userId }).returning();
    return row;
  }

  async scoreAll(org: string, formulaId: string) {
    await this.enabled(org);
    const [formula] = await this.db.select().from(schema.prioritisationFormulas).where(and(eq(schema.prioritisationFormulas.organizationId, org), eq(schema.prioritisationFormulas.id, formulaId), eq(schema.prioritisationFormulas.active, true))).limit(1);
    if (!formula) throw new AppError("NOT_FOUND", "Prioritisation formula not found");
    const ideas = await this.db.select().from(schema.ideas).where(eq(schema.ideas.organizationId, org));
    const scored = [];
    for (const idea of ideas) {
      const score = scoreIdea(formula.kind as "rice" | "wsjf" | "weighted", idea, formula.weights as Record<string, number>);
      await this.db.update(schema.ideas).set({ score, updatedAt: new Date() }).where(eq(schema.ideas.id, idea.id)); scored.push({ id: idea.id, score, explanation: { kind: formula.kind, inputs: { impact: idea.impact, confidence: idea.confidence, effort: idea.effort, reach: idea.reach, customerWeight: idea.customerWeight }, weights: formula.weights } });
    }
    return scored.sort((a, b) => b.score - a.score);
  }

  async mergeIdeas(org: string, userId: string, targetId: string, sourceIds: string[]) {
    await this.enabled(org);
    const ids = [...new Set(sourceIds.filter((id) => id !== targetId))];
    if (!ids.length) return { targetId, merged: 0 };
    const [target] = await this.db.select().from(schema.ideas).where(and(eq(schema.ideas.organizationId, org), eq(schema.ideas.id, targetId))).limit(1);
    if (!target) throw new AppError("NOT_FOUND", "Target idea not found");
    await this.db.transaction(async (tx) => {
      const links = await tx.select().from(schema.ideaInsights).where(and(eq(schema.ideaInsights.organizationId, org), inArray(schema.ideaInsights.ideaId, ids)));
      for (const link of links) await tx.insert(schema.ideaInsights).values({ organizationId: org, ideaId: targetId, insightId: link.insightId, relevance: link.relevance }).onConflictDoNothing();
      const delivery = await tx.select().from(schema.deliveryLinks).where(and(eq(schema.deliveryLinks.organizationId, org), inArray(schema.deliveryLinks.ideaId, ids)));
      for (const link of delivery) await tx.insert(schema.deliveryLinks).values({ organizationId: org, ideaId: targetId, projectId: link.projectId, workItemId: link.workItemId, relation: link.relation }).onConflictDoNothing();
      await tx.update(schema.ideas).set({ status: "merged", description: `Merged into ${targetId}`, updatedAt: new Date() }).where(and(eq(schema.ideas.organizationId, org), inArray(schema.ideas.id, ids)));
    });
    return { targetId, merged: ids.length, preserved: ["insights", "delivery_links", "source_ideas"] };
  }

  async linkDelivery(org: string, userId: string, ideaId: string, input: { projectId?: string; workItemId?: string; relation?: string }) {
    await this.enabled(org);
    if (!input.projectId && !input.workItemId) throw new AppError("VALIDATION", "Project or work item is required");
    if (input.projectId && !(await canAccessProject(this.db, org, input.projectId, userId))) throw new AppError("FORBIDDEN", "No access to project");
    if (input.workItemId && !(await canAccessWorkItem(this.db, org, input.workItemId, userId))) throw new AppError("FORBIDDEN", "No access to work item");
    const [row] = await this.db.insert(schema.deliveryLinks).values({ organizationId: org, ideaId, projectId: input.projectId, workItemId: input.workItemId, relation: input.relation ?? "delivered_by" }).onConflictDoNothing().returning();
    return row ?? input;
  }

  async ideaDetail(org: string, userId: string, id: string) {
    await this.enabled(org);
    const [idea] = await this.db.select().from(schema.ideas).where(and(eq(schema.ideas.organizationId, org), eq(schema.ideas.id, id))).limit(1);
    if (!idea) throw new AppError("NOT_FOUND", "Idea not found");
    const links = await this.db.select().from(schema.ideaInsights).where(and(eq(schema.ideaInsights.organizationId, org), eq(schema.ideaInsights.ideaId, id)));
    const insightIds = links.map((l) => l.insightId);
    const evidence = insightIds.length ? await this.db.select().from(schema.insights).where(and(eq(schema.insights.organizationId, org), inArray(schema.insights.id, insightIds))) : [];
    const delivery = await this.db.select().from(schema.deliveryLinks).where(and(eq(schema.deliveryLinks.organizationId, org), eq(schema.deliveryLinks.ideaId, id)));
    const safeDelivery = [];
    for (const link of delivery) if ((!link.projectId || await canAccessProject(this.db, org, link.projectId, userId)) && (!link.workItemId || await canAccessWorkItem(this.db, org, link.workItemId, userId))) safeDelivery.push(link);
    return { idea, evidence, delivery: safeDelivery };
  }

  async publish(org: string, userId: string, input: { name: string; fields?: string[]; filters?: Record<string, unknown>; expiresAt?: string }) {
    await this.enabled(org);
    const allowedFields = new Set(["title", "status", "description", "score", "kind", "tags"]);
    const fields = (input.fields ?? ["title", "status"]).filter((f) => allowedFields.has(f));
    const token = issueToken(24);
    const [row] = await this.db.insert(schema.roadmapPublications).values({ organizationId: org, name: input.name, tokenHash: token.hash, fields, filters: input.filters ?? {}, expiresAt: input.expiresAt ? new Date(input.expiresAt) : null, createdByUserId: userId }).returning();
    return { publication: row, publicToken: token.raw };
  }

  async revoke(org: string, id: string) { await this.enabled(org); await this.db.update(schema.roadmapPublications).set({ active: false, version: sql`${schema.roadmapPublications.version} + 1` }).where(and(eq(schema.roadmapPublications.organizationId, org), eq(schema.roadmapPublications.id, id))); return { id, revoked: true }; }

  async publicRoadmap(token: string) {
    const tokenHash = sha256(token);
    const [publication] = await this.db.select().from(schema.roadmapPublications).where(and(eq(schema.roadmapPublications.tokenHash, tokenHash), eq(schema.roadmapPublications.active, true), or(isNull(schema.roadmapPublications.expiresAt), gt(schema.roadmapPublications.expiresAt, new Date())))).limit(1);
    if (!publication || (publication.expiresAt && publication.expiresAt < new Date())) throw new AppError("NOT_FOUND", "Roadmap is unavailable or expired");
    const rows = await this.db.select().from(schema.ideas).where(eq(schema.ideas.organizationId, publication.organizationId));
    const fields = publication.fields as string[];
    const items = rows.filter((i) => i.status !== "merged").map((idea) => Object.fromEntries(fields.map((f) => [f, (idea as unknown as Record<string, unknown>)[f]])));
    await this.db.update(schema.roadmapPublications).set({ viewCount: publication.viewCount + 1 }).where(eq(schema.roadmapPublications.id, publication.id));
    return { name: publication.name, version: publication.version, items };
  }
}
