import { Injectable, Inject, Optional } from "@nestjs/common";
import { gte, sql, count, and, desc, eq, isNotNull, isNull, lt } from "drizzle-orm";
import { schema, type Database } from "@pm/db";
import { AppError } from "@pm/shared";
import { DB } from "../db/db.module.js";
import { PrivacyService } from "../privacy/privacy.service.js";

const DAY_MS = 86_400_000;

@Injectable()
export class DataOpsService {
  constructor(@Inject(DB) private readonly db: Database, @Optional() private readonly privacy?: PrivacyService) {}

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
    let purged = 0; let held = 0; const ids: string[] = [];
    for (const p of policies) {
      if (p.entity !== "work_item") continue;
      const cutoff = new Date(now.getTime() - p.retentionDays * DAY_MS);
      const expired = await this.db.select({
        id: schema.workItems.id, primaryOwnerUserId: schema.workItems.primaryOwnerUserId, reporterUserId: schema.workItems.reporterUserId,
        owningProjectId: schema.workItems.owningProjectId, deletedAt: schema.workItems.deletedAt,
      }).from(schema.workItems)
        .where(and(eq(schema.workItems.organizationId, organizationId), isNotNull(schema.workItems.deletedAt), lt(schema.workItems.deletedAt, cutoff)));
      for (const e of expired) {
        // X03.3.1 — an active legal hold is a hard block on retention purge.
        if (this.privacy && await this.privacy.isUnderLegalHold(organizationId, e)) { held++; continue; }
        await this.permanentDelete(organizationId, e.id); purged++; ids.push(e.id);
      }
    }
    return { purged, held, ids };
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

  // ---- X01.2 Trash Browsing (My / Project / Organization scopes) ----

  /** X01.2.1 — three scopes: mine (I deleted it), project (deleted within a project I can see), org (admin-wide). */
  async listTrash(organizationId: string, userId: string, scope: "mine" | "project" | "org", filters: { projectId?: string; type?: string; deleterId?: string }) {
    const conditions = [eq(schema.workItems.organizationId, organizationId), isNotNull(schema.workItems.deletedAt)];
    if (scope === "mine") conditions.push(eq(schema.workItems.deletedBy, userId));
    if (scope === "project" && filters.projectId) conditions.push(eq(schema.workItems.owningProjectId, filters.projectId));
    if (filters.projectId && scope !== "project") conditions.push(eq(schema.workItems.owningProjectId, filters.projectId));
    if (filters.deleterId) conditions.push(eq(schema.workItems.deletedBy, filters.deleterId));
    const rows = await this.db.select({
      id: schema.workItems.id, key: schema.workItems.key, title: schema.workItems.title,
      owningProjectId: schema.workItems.owningProjectId, parentId: schema.workItems.parentId,
      deletedAt: schema.workItems.deletedAt, deletedBy: schema.workItems.deletedBy,
      deleteReason: schema.workItems.deleteReason, deleteSource: schema.workItems.deleteSource,
      cascadeRootId: schema.workItems.cascadeRootId,
    }).from(schema.workItems).where(and(...conditions)).orderBy(desc(schema.workItems.deletedAt)).limit(500);
    return rows.map((r) => ({ ...r, isDirect: !r.cascadeRootId || r.cascadeRootId === r.id, isCascaded: Boolean(r.cascadeRootId) && r.cascadeRootId !== r.id }));
  }

  /** X01.1.8 — impact preview shown before a destructive delete: what else goes with it. */
  async deleteImpact(organizationId: string, id: string) {
    const [item] = await this.db.select({ id: schema.workItems.id, title: schema.workItems.title }).from(schema.workItems)
      .where(and(eq(schema.workItems.id, id), eq(schema.workItems.organizationId, organizationId))).limit(1);
    if (!item) throw new AppError("NOT_FOUND", "Item not found");
    const descendants = await this.db.select({ id: schema.workItems.id }).from(schema.workItems)
      .where(and(eq(schema.workItems.organizationId, organizationId), eq(schema.workItems.parentId, id), isNull(schema.workItems.deletedAt)));
    const [{ n: commentCount }] = await this.db.select({ n: count() }).from(schema.comments).where(eq(schema.comments.workItemId, id));
    const [{ n: fileCount }] = await this.db.select({ n: count() }).from(schema.attachments).where(eq(schema.attachments.workItemId, id));
    const [{ n: depCount }] = await this.db.select({ n: count() }).from(schema.workItemDependencies)
      .where(sql`${schema.workItemDependencies.predecessorId} = ${id} OR ${schema.workItemDependencies.successorId} = ${id}`);
    return { id, title: item.title, descendants: descendants.length, comments: Number(commentCount), files: Number(fileCount), dependencies: Number(depCount) };
  }

  /** X01.1.1/.5 — soft-delete with capture; descendants cascade under the same cascade_root_id, one transaction. */
  async softDelete(organizationId: string, userId: string, id: string, input: { reason?: string; source?: string }) {
    const now = new Date();
    const result = await this.db.transaction(async (tx) => {
      const [root] = await tx.select({ id: schema.workItems.id }).from(schema.workItems)
        .where(and(eq(schema.workItems.id, id), eq(schema.workItems.organizationId, organizationId), isNull(schema.workItems.deletedAt))).limit(1);
      if (!root) throw new AppError("NOT_FOUND", "Item not found or already deleted");
      const descendants = await tx.select({ id: schema.workItems.id }).from(schema.workItems)
        .where(and(eq(schema.workItems.organizationId, organizationId), eq(schema.workItems.parentId, id), isNull(schema.workItems.deletedAt)));
      const allIds = [id, ...descendants.map((d) => d.id)];
      for (const targetId of allIds) {
        await tx.update(schema.workItems).set({
          deletedAt: now, deletedBy: userId, deleteReason: input.reason ?? null, deleteSource: input.source ?? "ui", cascadeRootId: id,
        }).where(eq(schema.workItems.id, targetId));
      }
      return { deleted: allIds.length, cascaded: descendants.length, allIds };
    });
    await this.recordReversible(organizationId, userId, "soft_delete", "work_item", result.allIds, { rootId: id });
    return { deleted: result.deleted, cascaded: result.cascaded };
  }

  /** X01.3 — restore an item plus same-operation cascaded descendants; dead-parent surfaces a re-parent choice. */
  async restoreWithCascade(organizationId: string, id: string) {
    const [item] = await this.db.select().from(schema.workItems)
      .where(and(eq(schema.workItems.id, id), eq(schema.workItems.organizationId, organizationId), isNotNull(schema.workItems.deletedAt))).limit(1);
    if (!item) throw new AppError("NOT_FOUND", "Item not in the trash");
    let parentDead = false;
    if (item.parentId) {
      const [parent] = await this.db.select({ id: schema.workItems.id, deletedAt: schema.workItems.deletedAt }).from(schema.workItems).where(eq(schema.workItems.id, item.parentId)).limit(1);
      parentDead = !parent || Boolean(parent.deletedAt);
    }
    const cascaded = await this.db.select({ id: schema.workItems.id }).from(schema.workItems)
      .where(and(eq(schema.workItems.organizationId, organizationId), eq(schema.workItems.cascadeRootId, id), isNotNull(schema.workItems.deletedAt)));
    const allIds = [id, ...cascaded.map((c) => c.id).filter((cid) => cid !== id)];
    await this.db.transaction(async (tx) => {
      for (const targetId of allIds) {
        await tx.update(schema.workItems).set({ deletedAt: null, deletedBy: null, deleteReason: null, deleteSource: null, cascadeRootId: null }).where(eq(schema.workItems.id, targetId));
      }
    });
    return { restored: allIds.length, parentDead };
  }

  /** X01.3.6 — bulk restore with a per-item result artifact; never silently drops a failure. */
  async bulkRestore(organizationId: string, ids: string[]) {
    const results: { id: string; ok: boolean; error?: string }[] = [];
    for (const id of ids.slice(0, 200)) {
      try { await this.restoreWithCascade(organizationId, id); results.push({ id, ok: true }); }
      catch (e) { results.push({ id, ok: false, error: e instanceof AppError ? e.message : "Restore failed" }); }
    }
    return { total: results.length, restored: results.filter((r) => r.ok).length, results };
  }

  // ---- X01.4 Undo/Redo (session-scoped compensating-transaction stack) ----

  private readonly UNDO_WINDOW_MS = 20 * 60_000; // stack entries usable for 20 minutes; UI enforces the 60s "immediate" affordance separately

  /** Called by mutation call sites right before they mutate, capturing enough state to compensate. */
  async recordReversible(organizationId: string, userId: string, actionType: string, targetType: "work_item" | "project", targetIds: string[], preImage: unknown) {
    const [row] = await this.db.insert(schema.reversibleActions).values({ organizationId, userId, actionType, targetType, targetIds, preImage: preImage as object }).returning();
    return row;
  }

  async undoStack(organizationId: string, userId: string) {
    const cutoff = new Date(Date.now() - this.UNDO_WINDOW_MS);
    return this.db.select().from(schema.reversibleActions)
      .where(and(eq(schema.reversibleActions.organizationId, organizationId), eq(schema.reversibleActions.userId, userId), isNull(schema.reversibleActions.undoneAt), gte(schema.reversibleActions.createdAt, cutoff)))
      .orderBy(desc(schema.reversibleActions.createdAt)).limit(20);
  }

  async undoLast(organizationId: string, userId: string) {
    const [action] = await this.undoStack(organizationId, userId);
    if (!action) throw new AppError("NOT_FOUND", "Nothing to undo");
    await this.applyCompensation(organizationId, action);
    await this.db.update(schema.reversibleActions).set({ undoneAt: new Date() }).where(eq(schema.reversibleActions.id, action.id));
    return { undone: action.actionType, targetIds: action.targetIds };
  }

  /** X01.4.6 — redo only valid immediately after an undo and before any newer action. */
  async redoLast(organizationId: string, userId: string) {
    const [mostRecent] = await this.db.select().from(schema.reversibleActions)
      .where(and(eq(schema.reversibleActions.organizationId, organizationId), eq(schema.reversibleActions.userId, userId)))
      .orderBy(desc(schema.reversibleActions.createdAt)).limit(1);
    if (!mostRecent || !mostRecent.undoneAt || mostRecent.redoneAt) throw new AppError("CONFLICT", "Nothing to redo");
    // Re-apply the original mutation by reversing the compensation: for soft_delete that means deleting again.
    const ids = mostRecent.targetIds as string[];
    if (mostRecent.actionType === "soft_delete") {
      for (const id of ids) await this.softDelete(organizationId, userId, id, { source: "redo" });
    } else {
      // Generic field-restore actions: re-apply the values captured as the "after" state if present.
      const after = (mostRecent.preImage as { after?: Record<string, unknown>[] })?.after ?? [];
      for (const row of after) if (row.id) await this.db.update(schema.workItems).set(row).where(eq(schema.workItems.id, row.id as string));
    }
    await this.db.update(schema.reversibleActions).set({ redoneAt: new Date() }).where(eq(schema.reversibleActions.id, mostRecent.id));
    return { redone: mostRecent.actionType, targetIds: ids };
  }

  private async applyCompensation(organizationId: string, action: typeof schema.reversibleActions.$inferSelect) {
    const ids = action.targetIds as string[];
    if (action.actionType === "soft_delete") {
      await this.bulkRestore(organizationId, ids);
      return;
    }
    // bulk_edit/status_change/move/assign/archive: pre_image carries the exact prior row values to reinstate.
    const before = (action.preImage as { before?: Record<string, unknown>[] })?.before ?? [];
    for (const row of before) {
      if (!row.id) continue;
      const { id, ...patch } = row;
      await this.db.update(schema.workItems).set(patch).where(and(eq(schema.workItems.id, id as string), eq(schema.workItems.organizationId, organizationId)));
    }
  }
}
