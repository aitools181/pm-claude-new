import { Injectable, Inject } from "@nestjs/common";
import { and, desc, eq, isNotNull, isNull, lt } from "drizzle-orm";
import { schema, type Database } from "@pm/db";
import { AppError } from "@pm/shared";
import { DB } from "../db/db.module.js";

const DAY_MS = 86_400_000;

@Injectable()
export class DataOpsService {
  constructor(@Inject(DB) private readonly db: Database) {}

  // ---- recycle bin ----
  listRecycleBin(organizationId: string) {
    return this.db.select({ id: schema.workItems.id, key: schema.workItems.key, title: schema.workItems.title, deletedAt: schema.workItems.deletedAt, deletedBy: schema.workItems.deletedBy })
      .from(schema.workItems).where(and(eq(schema.workItems.organizationId, organizationId), isNotNull(schema.workItems.deletedAt))).orderBy(desc(schema.workItems.deletedAt));
  }

  async restore(organizationId: string, id: string) {
    const [row] = await this.db.update(schema.workItems).set({ deletedAt: null, deletedBy: null })
      .where(and(eq(schema.workItems.id, id), eq(schema.workItems.organizationId, organizationId), isNotNull(schema.workItems.deletedAt))).returning();
    if (!row) throw new AppError("NOT_FOUND", "Item not in recycle bin");
    return { restored: true, id };
  }

  /** Hard delete a soft-deleted item and its children (irreversible). */
  async permanentDelete(organizationId: string, id: string) {
    const [item] = await this.db.select().from(schema.workItems).where(and(eq(schema.workItems.id, id), eq(schema.workItems.organizationId, organizationId))).limit(1);
    if (!item) throw new AppError("NOT_FOUND", "Item not found");
    if (!item.deletedAt) throw new AppError("CONFLICT", "Item must be in the recycle bin before permanent deletion");
    await this.db.transaction(async (tx) => {
      await tx.delete(schema.workItemStatusHistory).where(eq(schema.workItemStatusHistory.workItemId, id));
      await tx.delete(schema.workItemAssignees).where(eq(schema.workItemAssignees.workItemId, id));
      await tx.delete(schema.workItemPlacements).where(eq(schema.workItemPlacements.workItemId, id));
      await tx.delete(schema.activityEvents).where(eq(schema.activityEvents.workItemId, id));
      await tx.delete(schema.workItems).where(and(eq(schema.workItems.id, id), eq(schema.workItems.organizationId, organizationId)));
    });
    return { purged: true, id };
  }

  // ---- retention ----
  async setRetention(organizationId: string, input: { entity?: string; retentionDays: number; autoPurge?: boolean }) {
    const entity = input.entity ?? "work_item";
    const [row] = await this.db.insert(schema.retentionPolicies).values({ organizationId, entity, retentionDays: input.retentionDays, autoPurge: input.autoPurge ?? false })
      .onConflictDoUpdate({ target: [schema.retentionPolicies.organizationId, schema.retentionPolicies.entity], set: { retentionDays: input.retentionDays, autoPurge: input.autoPurge ?? false, updatedAt: new Date() } }).returning();
    return row;
  }
  getRetention(organizationId: string) { return this.db.select().from(schema.retentionPolicies).where(eq(schema.retentionPolicies.organizationId, organizationId)); }

  /** Permanently purge recycle-bin items older than the policy's retention window. */
  async purgeExpired(organizationId: string, now: Date = new Date()) {
    const policies = await this.getRetention(organizationId);
    let purged = 0; const ids: string[] = [];
    for (const p of policies) {
      if (p.entity !== "work_item") continue;
      const cutoff = new Date(now.getTime() - p.retentionDays * DAY_MS);
      const expired = await this.db.select({ id: schema.workItems.id }).from(schema.workItems)
        .where(and(eq(schema.workItems.organizationId, organizationId), isNotNull(schema.workItems.deletedAt), lt(schema.workItems.deletedAt, cutoff)));
      for (const e of expired) { await this.permanentDelete(organizationId, e.id); purged++; ids.push(e.id); }
    }
    return { purged, ids };
  }

  // ---- export ----
  async exportOrg(organizationId: string) {
    const [org] = await this.db.select().from(schema.organizations).where(eq(schema.organizations.id, organizationId)).limit(1);
    if (!org) throw new AppError("NOT_FOUND", "Organization not found");
    const projects = await this.db.select().from(schema.projects).where(and(eq(schema.projects.organizationId, organizationId), isNull(schema.projects.deletedAt)));
    const workItems = await this.db.select().from(schema.workItems).where(and(eq(schema.workItems.organizationId, organizationId), isNull(schema.workItems.deletedAt)));
    return {
      exportedAt: new Date().toISOString(),
      organization: { id: org.id, name: org.name, slug: org.slug },
      counts: { projects: projects.length, workItems: workItems.length },
      data: { projects, workItems },
    };
  }
}
