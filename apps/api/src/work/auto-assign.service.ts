import { Injectable, Inject } from "@nestjs/common";
import { and, eq, isNull, sql, inArray, ne } from "drizzle-orm";
import { schema, type Database } from "@pm/db";
import { AppError } from "@pm/shared";
import { DB } from "../db/db.module.js";

export type AutoAssignStrategy = "round_robin" | "least_load" | "skill_match" | "weighted";

/**
 * ASN.D3 — auto-assignment strategies. Every strategy filters candidates down
 * to active organization members first (authorization/availability check),
 * then picks one according to the chosen strategy. This service only
 * *suggests* — callers decide whether to actually assign.
 */
@Injectable()
export class AutoAssignService {
  constructor(@Inject(DB) private readonly db: Database) {}

  private async eligibleCandidates(organizationId: string, candidateUserIds: string[]) {
    if (!candidateUserIds.length) return [];
    const rows = await this.db.select({ userId: schema.organizationMemberships.userId }).from(schema.organizationMemberships)
      .where(and(
        eq(schema.organizationMemberships.organizationId, organizationId),
        inArray(schema.organizationMemberships.userId, candidateUserIds),
        eq(schema.organizationMemberships.status, "active"),
        isNull(schema.organizationMemberships.deletedAt),
      ));
    return rows.map((r) => r.userId);
  }

  async suggest(organizationId: string, projectId: string, strategy: AutoAssignStrategy, candidateUserIds: string[], opts: { skill?: string; weights?: Record<string, number> } = {}) {
    const eligible = await this.eligibleCandidates(organizationId, candidateUserIds);
    if (!eligible.length) throw new AppError("VALIDATION", "None of the candidates are active members of this organization");

    switch (strategy) {
      case "round_robin": return this.roundRobin(organizationId, projectId, eligible);
      case "least_load": return this.leastLoad(organizationId, eligible);
      case "skill_match": return this.skillMatch(organizationId, eligible, opts.skill);
      case "weighted": return this.weighted(eligible, opts.weights ?? {});
      default: throw new AppError("VALIDATION", `Unknown strategy "${strategy}"`);
    }
  }

  /** Stable rotation: candidates sorted by id; pick the one after the last-assigned cursor, wrapping around. */
  private async roundRobin(organizationId: string, projectId: string, eligible: string[]) {
    const sorted = [...eligible].sort();
    const [cursor] = await this.db.select().from(schema.autoAssignmentCursors)
      .where(and(eq(schema.autoAssignmentCursors.organizationId, organizationId), eq(schema.autoAssignmentCursors.projectId, projectId))).limit(1);
    let nextIndex = 0;
    if (cursor?.lastAssignedUserId) {
      const lastIndex = sorted.indexOf(cursor.lastAssignedUserId);
      nextIndex = lastIndex === -1 ? 0 : (lastIndex + 1) % sorted.length;
    }
    const chosen = sorted[nextIndex];
    await this.db.insert(schema.autoAssignmentCursors).values({ organizationId, projectId, lastAssignedUserId: chosen })
      .onConflictDoUpdate({ target: [schema.autoAssignmentCursors.organizationId, schema.autoAssignmentCursors.projectId], set: { lastAssignedUserId: chosen, updatedAt: new Date() } });
    return { userId: chosen, strategy: "round_robin" as const, reason: `Next in rotation after ${cursor?.lastAssignedUserId ?? "(none yet)"}` };
  }

  /** Fewest open (non-done) owned items among the eligible candidates. */
  private async leastLoad(organizationId: string, eligible: string[]) {
    const rows = await this.db.select({ userId: schema.workItems.primaryOwnerUserId, n: sql<number>`count(*)::int` }).from(schema.workItems)
      .where(and(eq(schema.workItems.organizationId, organizationId), inArray(schema.workItems.primaryOwnerUserId, eligible), ne(schema.workItems.statusCategory, "done"), isNull(schema.workItems.deletedAt)))
      .groupBy(schema.workItems.primaryOwnerUserId);
    const load = new Map(rows.map((r) => [r.userId as string, Number(r.n)]));
    const ranked = eligible.map((userId) => ({ userId, openItems: load.get(userId) ?? 0 })).sort((a, b) => a.openItems - b.openItems);
    return { userId: ranked[0].userId, strategy: "least_load" as const, reason: `${ranked[0].openItems} open item(s), fewest among candidates` };
  }

  /** Delegates to the existing skills registry: highest level, then lightest load (same signal as /skills/suggest). */
  private async skillMatch(organizationId: string, eligible: string[], skill?: string) {
    if (!skill) throw new AppError("VALIDATION", "skill_match requires a skill name");
    const wanted = skill.trim().toLowerCase();
    const skilled = await this.db.select({ userId: schema.userSkills.userId, level: schema.userSkills.level }).from(schema.userSkills)
      .where(and(eq(schema.userSkills.organizationId, organizationId), eq(schema.userSkills.skill, wanted), isNull(schema.userSkills.deletedAt), inArray(schema.userSkills.userId, eligible)));
    if (!skilled.length) throw new AppError("VALIDATION", `No eligible candidate has the "${skill}" skill recorded`);
    const rows = await this.db.select({ userId: schema.workItems.primaryOwnerUserId, n: sql<number>`count(*)::int` }).from(schema.workItems)
      .where(and(eq(schema.workItems.organizationId, organizationId), inArray(schema.workItems.primaryOwnerUserId, skilled.map((s) => s.userId)), ne(schema.workItems.statusCategory, "done"), isNull(schema.workItems.deletedAt)))
      .groupBy(schema.workItems.primaryOwnerUserId);
    const load = new Map(rows.map((r) => [r.userId as string, Number(r.n)]));
    const ranked = skilled.map((s) => ({ ...s, openItems: load.get(s.userId) ?? 0 })).sort((a, b) => b.level - a.level || a.openItems - b.openItems);
    return { userId: ranked[0].userId, strategy: "skill_match" as const, reason: `Skill level ${ranked[0].level}, ${ranked[0].openItems} open item(s)` };
  }

  /** Weighted random pick; candidates without an explicit weight default to 1. */
  private weighted(eligible: string[], weights: Record<string, number>) {
    const entries = eligible.map((userId) => ({ userId, weight: Math.max(0, weights[userId] ?? 1) }));
    const total = entries.reduce((sum, e) => sum + e.weight, 0);
    if (total <= 0) throw new AppError("VALIDATION", "All candidate weights are zero");
    let roll = Math.random() * total;
    for (const e of entries) { if ((roll -= e.weight) <= 0) return { userId: e.userId, strategy: "weighted" as const, reason: `Weighted pick (weight ${e.weight}/${total})` }; }
    return { userId: entries[entries.length - 1].userId, strategy: "weighted" as const, reason: "Weighted pick (fallback)" };
  }
}
