import { Injectable, Inject } from "@nestjs/common";
import { and, eq, isNull, sql } from "drizzle-orm";
import { schema, type Database } from "@pm/db";
import { AppError } from "@pm/shared";
import { DB } from "../db/db.module.js";
import { WorkItemsService } from "./work-items.service.js";
import { rankBetween } from "./rank.js";
import { canAccessProject } from "../collab/access.js";

const MAX_DEPTH = 5;
/** v3 §9.8 parent-child type matrix. Unknown/custom types require configured rules before hierarchy mutation. */
const ALLOWED_CHILDREN: Record<string, string[]> = {
  task: ["subtask"], subtask: ["subtask"], initiative: ["epic"], epic: ["story", "task", "bug"],
  story: ["subtask", "bug"], bug: ["subtask"], request: ["task", "approval"], milestone: [], idea: ["experiment", "initiative"],
};

@Injectable()
export class WorkItemMobilityService {
  constructor(@Inject(DB) private readonly db: Database, private readonly items: WorkItemsService) {}

  private async load(org: string, id: string) {
    const [it] = await this.db.select().from(schema.workItems).where(and(eq(schema.workItems.id, id), eq(schema.workItems.organizationId, org), isNull(schema.workItems.deletedAt))).limit(1);
    if (!it) throw new AppError("NOT_FOUND", "Work item not found");
    return it;
  }
  private async typeKey(typeId: string | null): Promise<string> {
    if (!typeId) return "task";
    const [t] = await this.db.select({ key: schema.workItemTypes.key }).from(schema.workItemTypes).where(eq(schema.workItemTypes.id, typeId)).limit(1);
    return t?.key ?? "task";
  }
  private async children(org: string, parentId: string) {
    return this.db.select().from(schema.workItems).where(and(eq(schema.workItems.organizationId, org), eq(schema.workItems.parentId, parentId), isNull(schema.workItems.deletedAt)));
  }
  private async subtreeHeight(org: string, id: string): Promise<number> {
    const kids = await this.children(org, id);
    if (!kids.length) return 1;
    return 1 + Math.max(...(await Promise.all(kids.map((k) => this.subtreeHeight(org, k.id)))));
  }
  private async depthOf(org: string, id: string): Promise<number> {
    let depth = 1, cur = await this.load(org, id);
    while (cur.parentId) {
      depth++;
      const [parent] = await this.db.select().from(schema.workItems).where(and(
        eq(schema.workItems.organizationId, org),
        eq(schema.workItems.id, cur.parentId),
        isNull(schema.workItems.deletedAt),
      )).limit(1);
      if (!parent) break;
      cur = parent;
      if (depth > 50) break;
    }
    return depth;
  }
  private async isDescendant(org: string, ancestorId: string, maybeDescId: string): Promise<boolean> {
    let cur = await this.db.select({ id: schema.workItems.id, parentId: schema.workItems.parentId }).from(schema.workItems).where(and(
      eq(schema.workItems.organizationId, org),
      eq(schema.workItems.id, maybeDescId),
      isNull(schema.workItems.deletedAt),
    )).limit(1).then((rows) => rows[0]);
    let guard = 0;
    while (cur?.parentId) {
      if (cur.parentId === ancestorId) return true;
      cur = await this.db.select({ id: schema.workItems.id, parentId: schema.workItems.parentId }).from(schema.workItems).where(and(
        eq(schema.workItems.organizationId, org),
        eq(schema.workItems.id, cur.parentId),
        isNull(schema.workItems.deletedAt),
      )).limit(1).then((rows) => rows[0]);
      if (++guard > 50) break;
    }
    return false;
  }

  /** Promote (newParentId=null), demote or re-parent with matrix/cycle/depth checks (§9.11). */
  async reparent(org: string, userId: string, itemId: string, newParentId: string | null) {
    await this.items.assertAccess(org, itemId, userId);
    const item = await this.load(org, itemId);
    if (newParentId) {
      await this.items.assertAccess(org, newParentId, userId);
      if (newParentId === itemId) throw new AppError("VALIDATION", "An item cannot be its own parent");
      const parent = await this.load(org, newParentId);
      if (parent.owningProjectId !== item.owningProjectId) throw new AppError("VALIDATION", "Re-parent must stay within the same project in V1");
      if (await this.isDescendant(org, itemId, newParentId)) throw new AppError("VALIDATION", "Cannot re-parent under a descendant (cycle)");
      const [childKey, parentKey] = [await this.typeKey(item.typeId), await this.typeKey(parent.typeId)];
      const allowed = ALLOWED_CHILDREN[parentKey];
      if (!allowed || !allowed.includes(childKey)) throw new AppError("VALIDATION", `A ${parentKey} may not contain a ${childKey}`);
      const parentDepth = await this.depthOf(org, newParentId);
      if (parentDepth + (await this.subtreeHeight(org, itemId)) > MAX_DEPTH) throw new AppError("VALIDATION", `Move would exceed max depth ${MAX_DEPTH}`);
    }
    await this.db.update(schema.workItems).set({ parentId: newParentId, updatedBy: userId, updatedAt: new Date(), version: sql`${schema.workItems.version} + 1` }).where(and(eq(schema.workItems.id, itemId), eq(schema.workItems.organizationId, org)));
    await this.db.insert(schema.activityEvents).values({ organizationId: org, workItemId: itemId, projectId: item.owningProjectId, actorUserId: userId, action: newParentId ? "work_item.reparented" : "work_item.promoted", data: `${item.parentId ?? "root"}->${newParentId ?? "root"}` });
    return { id: itemId, parentId: newParentId };
  }

  /** Permission-safe impact preview for hierarchy actions. */
  async hierarchyPreview(org: string, userId: string, itemId: string, input: { action: "promote" | "demote" | "reparent" | "archive" | "delete"; targetParentId?: string | null }) {
    await this.items.assertAccess(org, itemId, userId);
    const item = await this.load(org, itemId);
    const subtree = await this.collectSubtree(org, itemId);
    const visible = [];
    for (const candidate of subtree) {
      try { await this.items.assertAccess(org, candidate.id, userId); visible.push({ id: candidate.id, key: candidate.key, title: candidate.title, parentId: candidate.parentId }); }
      catch { visible.push({ id: candidate.id, key: "Restricted", title: "Restricted work item", parentId: null }); }
    }
    let validation: { valid: boolean; message?: string } = { valid: true };
    if (["demote", "reparent"].includes(input.action)) {
      if (!input.targetParentId) validation = { valid: false, message: "Target parent is required" };
      else {
        try {
          const parent = await this.load(org, input.targetParentId);
          if (parent.owningProjectId !== item.owningProjectId) throw new AppError("VALIDATION", "Target parent must be in the same project");
          if (await this.isDescendant(org, itemId, parent.id)) throw new AppError("VALIDATION", "Target parent is inside the selected subtree");
          const [childKey, parentKey] = [await this.typeKey(item.typeId), await this.typeKey(parent.typeId)];
          if (!ALLOWED_CHILDREN[parentKey]?.includes(childKey)) throw new AppError("VALIDATION", `A ${parentKey} may not contain a ${childKey}`);
          if ((await this.depthOf(org, parent.id)) + (await this.subtreeHeight(org, item.id)) > MAX_DEPTH) throw new AppError("VALIDATION", `Move would exceed max depth ${MAX_DEPTH}`);
        } catch (error) { validation = { valid: false, message: error instanceof Error ? error.message : "Invalid hierarchy action" }; }
      }
    }
    return { action: input.action, item: { id: item.id, key: item.key, parentId: item.parentId }, affectedCount: subtree.length, descendants: visible.slice(1), validation, noSilentCascade: true };
  }

  promote(org: string, userId: string, itemId: string) { return this.reparent(org, userId, itemId, null); }
  demote(org: string, userId: string, itemId: string, parentId: string) { return this.reparent(org, userId, itemId, parentId); }

  /** Duplicate/clone (§9.12): new identity, status reset, comments never copied, optional subtree. */
  async clone(org: string, userId: string, sourceId: string, opts: { includeSubtasks?: boolean; keepOwner?: boolean; keepDates?: boolean; parentId?: string | null } = {}) {
    await this.items.assertAccess(org, sourceId, userId);
    const src = await this.load(org, sourceId);
    const typeKey = await this.typeKey(src.typeId);
    const clone = await this.items.create(org, userId, {
      projectId: src.owningProjectId, title: src.title, typeKey,
      parentId: opts.parentId === undefined ? (src.parentId ?? undefined) : (opts.parentId ?? undefined),
      description: src.description ?? undefined, priority: src.priority ?? undefined,
      primaryOwnerUserId: opts.keepOwner ? (src.primaryOwnerUserId ?? undefined) : userId,
    });
    if (opts.keepDates) await this.db.update(schema.workItems).set({ startDate: src.startDate, dueDate: src.dueDate }).where(eq(schema.workItems.id, clone.id));
    await this.db.insert(schema.activityEvents).values({ organizationId: org, workItemId: clone.id, projectId: src.owningProjectId, actorUserId: userId, action: "work_item.cloned", data: src.key });
    let clonedChildren = 0;
    if (opts.includeSubtasks) {
      for (const child of await this.children(org, sourceId)) { await this.clone(org, userId, child.id, { includeSubtasks: true, keepOwner: opts.keepOwner, keepDates: opts.keepDates, parentId: clone.id }); clonedChildren++; }
    }
    return { clone, sourceId, clonedChildren };
  }

  /** Bulk create one item per line; partial success with an editable error report (§9.13). */
  async bulkCreate(org: string, userId: string, projectId: string, lines: string[]) {
    if (lines.length > 1000) throw new AppError("VALIDATION", "A bulk create batch may contain at most 1000 rows");
    if (!(await canAccessProject(this.db, org, projectId, userId))) throw new AppError("FORBIDDEN", "No access to the project");
    const results: { line: number; title: string; ok: boolean; id?: string; error?: string }[] = [];
    let created = 0;
    for (let i = 0; i < lines.length; i++) {
      const title = (lines[i] ?? "").trim();
      if (!title) { results.push({ line: i, title, ok: false, error: "empty title" }); continue; }
      try { const it = await this.items.create(org, userId, { projectId, title }); results.push({ line: i, title, ok: true, id: it.id }); created++; }
      catch (e) { results.push({ line: i, title, ok: false, error: e instanceof Error ? e.message : "failed" }); }
    }
    return { created, failed: results.length - created, results };
  }

  /** Controlled cross-project move with new key + searchable key history (§9.20). Cross-org prohibited. */
  async move(org: string, userId: string, itemId: string, input: { destinationProjectId: string; hierarchyHandling?: "single" | "subtree" | "promote_children"; reason?: string; dryRun?: boolean }) {
    await this.items.assertAccess(org, itemId, userId);
    if (!(await canAccessProject(this.db, org, input.destinationProjectId, userId))) throw new AppError("FORBIDDEN", "No access to the destination project");
    const item = await this.load(org, itemId);
    const [dest] = await this.db.select().from(schema.projects).where(and(eq(schema.projects.id, input.destinationProjectId), eq(schema.projects.organizationId, org), isNull(schema.projects.deletedAt))).limit(1);
    if (!dest) throw new AppError("NOT_FOUND", "Destination project not found (cross-organization moves are prohibited)");
    if (["completed", "archived"].includes(dest.status)) throw new AppError("VALIDATION", "Destination project is read-only", { code: "WORK_ITEM_PROJECT_READ_ONLY" });
    if (dest.id === item.owningProjectId) throw new AppError("CONFLICT", "Item is already in that project");
    const handling = input.hierarchyHandling ?? "single";
    const directChildren = await this.children(org, itemId);
    const hierarchyWarning = handling === "single" && directChildren.length > 0
      ? "This item has children. Move the subtree or promote the children before moving only the parent."
      : null;
    const toMove = handling === "subtree" ? await this.collectSubtree(org, itemId) : [item];

    if (input.dryRun) return {
      dryRun: true,
      valid: !hierarchyWarning,
      warning: hierarchyWarning,
      directChildren: directChildren.length,
      wouldMove: toMove.length,
      destination: dest.name,
      preview: toMove.map((workItem) => workItem.key),
    };
    if (hierarchyWarning) throw new AppError("VALIDATION", hierarchyWarning, { code: "WORK_ITEM_MOVE_MAPPING_REQUIRED" });

    return this.db.transaction(async (tx) => {
      const movedKeys: { id: string; oldKey: string; newKey: string }[] = [];
      for (const workItem of toMove) {
        const [project] = await tx.update(schema.projects)
          .set({ nextKeySeq: sql`${schema.projects.nextKeySeq} + 1` })
          .where(and(eq(schema.projects.id, dest.id), eq(schema.projects.organizationId, org), isNull(schema.projects.deletedAt)))
          .returning({ prefix: schema.projects.keyPrefix, seq: sql<number>`${schema.projects.nextKeySeq} - 1`, workspaceId: schema.projects.workspaceId });
        if (!project) throw new AppError("CONFLICT", "Destination project changed during the move");
        const newKey = `${project.prefix}-${project.seq}`;
        await tx.update(schema.workItems).set({
          owningProjectId: dest.id,
          workspaceId: project.workspaceId,
          key: newKey,
          updatedBy: userId,
          ...(workItem.id === itemId ? { parentId: null } : {}),
        }).where(and(eq(schema.workItems.id, workItem.id), eq(schema.workItems.organizationId, org)));
        await tx.update(schema.workItemPlacements).set({ projectId: dest.id, sectionId: null }).where(and(
          eq(schema.workItemPlacements.organizationId, org),
          eq(schema.workItemPlacements.workItemId, workItem.id),
          eq(schema.workItemPlacements.isOwning, true),
          isNull(schema.workItemPlacements.deletedAt),
        ));
        await tx.insert(schema.workItemKeyHistory).values({ organizationId: org, workItemId: workItem.id, oldKey: workItem.key, oldProjectId: workItem.owningProjectId, newKey, reason: input.reason, actorUserId: userId });
        await tx.insert(schema.activityEvents).values({ organizationId: org, workItemId: workItem.id, projectId: dest.id, actorUserId: userId, action: "work_item.moved", data: `${workItem.key}->${newKey}` });
        movedKeys.push({ id: workItem.id, oldKey: workItem.key, newKey });
      }
      if (handling === "promote_children") {
        for (const child of directChildren) {
          await tx.update(schema.workItems).set({ parentId: null, updatedBy: userId }).where(and(eq(schema.workItems.id, child.id), eq(schema.workItems.organizationId, org)));
        }
      }
      return { moved: movedKeys.length, destination: dest.name, keys: movedKeys };
    });
  }

  private async collectSubtree(org: string, rootId: string) {
    const out = [await this.load(org, rootId)];
    const walk = async (pid: string) => { for (const c of await this.children(org, pid)) { out.push(c); await walk(c.id); } };
    await walk(rootId);
    return out;
  }

  /** Roll back the latest cross-project move by moving to the previous owning project with a new stable key. */
  async rollbackLatestMove(org: string, userId: string, itemId: string, reason?: string, dryRun = false) {
    await this.items.assertAccess(org, itemId, userId);
    const [history] = await this.db.select().from(schema.workItemKeyHistory).where(and(eq(schema.workItemKeyHistory.organizationId, org), eq(schema.workItemKeyHistory.workItemId, itemId))).orderBy(sql`${schema.workItemKeyHistory.at} DESC`).limit(1);
    if (!history?.oldProjectId) throw new AppError("NOT_FOUND", "No reversible move history found");
    return this.move(org, userId, itemId, { destinationProjectId: history.oldProjectId, hierarchyHandling: "single", reason: reason ?? `Rollback of move ${history.id}`, dryRun });
  }

  /** Resolve an old (redirected) key to its current work item. */
  async resolveKey(org: string, oldKey: string, userId: string) {
    const [hit] = await this.db.select().from(schema.workItemKeyHistory).where(and(eq(schema.workItemKeyHistory.organizationId, org), eq(schema.workItemKeyHistory.oldKey, oldKey))).orderBy(sql`${schema.workItemKeyHistory.at} DESC`).limit(1);
    if (!hit) return null;
    const [item] = await this.db.select({ id: schema.workItems.id, key: schema.workItems.key }).from(schema.workItems).where(and(eq(schema.workItems.id, hit.workItemId), eq(schema.workItems.organizationId, org))).limit(1);
    if (!item) return null;
    await this.items.assertAccess(org, item.id, userId);
    return { workItemId: item.id, currentKey: item.key, from: oldKey };
  }
}
