import { Injectable, Inject } from "@nestjs/common";
import { and, eq, isNull, sql, desc, asc, count } from "drizzle-orm";
import { schema, type Database } from "@pm/db";
import { AppError } from "@pm/shared";
import { DB } from "../db/db.module.js";
import { canAccessWorkItem } from "../collab/access.js";
import { rankBetween } from "./rank.js";

const CATEGORY: Record<string, "todo" | "in_progress" | "done"> = {
  "To Do": "todo",
  "In Progress": "in_progress",
  "Done": "done",
};
const ALLOWED_STATUS = new Set(Object.keys(CATEGORY));
const MAX_DEPTH = 5;
const ALLOWED_CHILDREN: Record<string, string[]> = {
  task: ["subtask"],
  subtask: ["subtask"],
  initiative: ["epic"],
  epic: ["story", "task", "bug"],
  story: ["subtask", "bug"],
  bug: ["subtask"],
  request: ["task", "approval"],
  approval: [],
  milestone: [],
  idea: ["experiment", "initiative"],
  experiment: ["task"],
};

function hierarchyError(message: string, code: string) {
  return new AppError("VALIDATION", message, { code });
}

@Injectable()
export class WorkItemsService {
  constructor(@Inject(DB) private readonly db: Database) {}

  private async typeId(tx: Database, organizationId: string, key: string) {
    const [t] = await tx.select().from(schema.workItemTypes)
      .where(and(eq(schema.workItemTypes.organizationId, organizationId), eq(schema.workItemTypes.key, key))).limit(1);
    if (!t) throw hierarchyError(`Missing work item type: ${key}`, "WORK_ITEM_TYPE_NOT_ALLOWED");
    return t.id;
  }

  private async typeKey(tx: Database, organizationId: string, typeId: string) {
    const [t] = await tx.select({ key: schema.workItemTypes.key }).from(schema.workItemTypes)
      .where(and(eq(schema.workItemTypes.organizationId, organizationId), eq(schema.workItemTypes.id, typeId))).limit(1);
    return t?.key ?? "task";
  }

  private async assertEligibleAssignee(tx: Database, organizationId: string, userId: string) {
    const [member] = await tx.select({ id: schema.organizationMemberships.id }).from(schema.organizationMemberships)
      .where(and(
        eq(schema.organizationMemberships.organizationId, organizationId),
        eq(schema.organizationMemberships.userId, userId),
        eq(schema.organizationMemberships.status, "active"),
        isNull(schema.organizationMemberships.deletedAt),
      )).limit(1);
    if (!member) throw hierarchyError("The selected assignee is not an active member of this organization", "WORK_ITEM_ASSIGNEE_NOT_ALLOWED");
  }

  private async parentDepth(tx: Database, organizationId: string, parentId: string) {
    let depth = 1;
    let currentId: string | null = parentId;
    const seen = new Set<string>();
    while (currentId) {
      if (seen.has(currentId)) throw hierarchyError("Hierarchy cycle detected", "WORK_ITEM_HIERARCHY_CYCLE");
      seen.add(currentId);
      const [row] = await tx.select({ parentId: schema.workItems.parentId }).from(schema.workItems)
        .where(and(eq(schema.workItems.organizationId, organizationId), eq(schema.workItems.id, currentId), isNull(schema.workItems.deletedAt))).limit(1);
      if (!row) throw hierarchyError("Parent work item is not available", "WORK_ITEM_PARENT_INACCESSIBLE");
      currentId = row.parentId;
      if (currentId) depth += 1;
      if (depth > MAX_DEPTH) throw hierarchyError(`Hierarchy exceeds maximum depth ${MAX_DEPTH}`, "WORK_ITEM_MAX_DEPTH_EXCEEDED");
    }
    return depth;
  }

  private async validateParent(tx: Database, organizationId: string, projectId: string, parentId: string, childType: string, childTypeId: string) {
    const [parent] = await tx.select().from(schema.workItems)
      .where(and(
        eq(schema.workItems.organizationId, organizationId),
        eq(schema.workItems.id, parentId),
        isNull(schema.workItems.deletedAt),
      )).limit(1);
    if (!parent) throw hierarchyError("Parent work item is not available", "WORK_ITEM_PARENT_INACCESSIBLE");
    if (parent.owningProjectId !== projectId) {
      throw hierarchyError("A subtask must stay in the same owning project as its parent", "WORK_ITEM_CROSS_PROJECT_PARENT_PROHIBITED");
    }
    const parentType = await this.typeKey(tx, organizationId, parent.typeId);
    const [childDefinition] = await tx.select({ parentTypeId: schema.workItemTypes.parentTypeId }).from(schema.workItemTypes)
      .where(and(eq(schema.workItemTypes.organizationId, organizationId), eq(schema.workItemTypes.id, childTypeId))).limit(1);
    const seedAllowed = ALLOWED_CHILDREN[parentType]?.includes(childType) ?? false;
    const configuredAllowed = childDefinition?.parentTypeId === parent.typeId;
    if (!seedAllowed && !configuredAllowed) {
      throw hierarchyError(`A ${parentType} may not contain a ${childType}`, "WORK_ITEM_PARENT_NOT_ALLOWED");
    }
    const depth = await this.parentDepth(tx, organizationId, parentId);
    if (depth + 1 > MAX_DEPTH) {
      throw hierarchyError(`Hierarchy exceeds maximum depth ${MAX_DEPTH}`, "WORK_ITEM_MAX_DEPTH_EXCEEDED");
    }
    return parent;
  }

  async assertAccess(organizationId: string, id: string, userId: string) {
    if (!(await canAccessWorkItem(this.db, organizationId, id, userId))) {
      throw new AppError("FORBIDDEN", "You do not have access to this work item");
    }
  }

  /**
   * Atomic: allocate a per-project key, create the Work Item and its single
   * Owning Placement together, set the primary owner, and record activity.
   * owning_project_id is set once here and is never mutated afterwards.
   */
  async create(organizationId: string, userId: string, input: {
    projectId: string;
    title: string;
    typeKey?: string;
    parentId?: string;
    sectionId?: string;
    primaryOwnerUserId?: string;
    priority?: string;
    status?: string;
    description?: string;
  }) {
    const title = input.title.trim();
    if (!title) throw hierarchyError("Work item title is required", "WORK_ITEM_TITLE_REQUIRED");
    const requestedType = input.typeKey ?? (input.parentId ? "subtask" : "task");
    if (requestedType === "subtask" && !input.parentId) {
      throw hierarchyError("A subtask requires a parent work item", "WORK_ITEM_PARENT_REQUIRED");
    }
    const status = input.status ?? "To Do";
    if (!ALLOWED_STATUS.has(status)) throw hierarchyError("Initial status is not allowed", "WORK_ITEM_STATUS_NOT_ALLOWED");

    return this.db.transaction(async (tx) => {
      // Lock the project row and allocate the next key atomically.
      const [proj] = await tx.update(schema.projects)
        .set({ nextKeySeq: sql`${schema.projects.nextKeySeq} + 1` })
        .where(and(
          eq(schema.projects.id, input.projectId),
          eq(schema.projects.organizationId, organizationId),
          isNull(schema.projects.deletedAt),
        ))
        .returning({
          workspaceId: schema.projects.workspaceId,
          prefix: schema.projects.keyPrefix,
          seq: sql<number>`${schema.projects.nextKeySeq} - 1`,
          status: schema.projects.status,
        });
      if (!proj) throw new AppError("NOT_FOUND", "Project not found", { code: "WORK_ITEM_PROJECT_REQUIRED" });
      if (["completed", "archived"].includes(proj.status)) {
        throw hierarchyError("This project is read-only", "WORK_ITEM_PROJECT_READ_ONLY");
      }

      const typeId = await this.typeId(tx as unknown as Database, organizationId, requestedType);
      if (input.parentId) await this.validateParent(tx as unknown as Database, organizationId, input.projectId, input.parentId, requestedType, typeId);
      if (input.primaryOwnerUserId) await this.assertEligibleAssignee(tx as unknown as Database, organizationId, input.primaryOwnerUserId);

      if (input.sectionId) {
        const [section] = await tx.select({ id: schema.sections.id }).from(schema.sections)
          .where(and(
            eq(schema.sections.organizationId, organizationId),
            eq(schema.sections.projectId, input.projectId),
            eq(schema.sections.id, input.sectionId),
            isNull(schema.sections.deletedAt),
          )).limit(1);
        if (!section) throw hierarchyError("Section does not belong to this project", "WORK_ITEM_PARENT_NOT_ALLOWED");
      }

      const key = `${proj.prefix}-${proj.seq}`;
      const [item] = await tx.insert(schema.workItems).values({
        organizationId,
        workspaceId: proj.workspaceId,
        owningProjectId: input.projectId,
        typeId,
        parentId: input.parentId,
        key,
        title,
        description: input.description,
        status,
        statusCategory: CATEGORY[status],
        priority: input.priority ?? "normal",
        reporterUserId: userId,
        primaryOwnerUserId: input.primaryOwnerUserId ?? userId,
        createdBy: userId,
      }).returning();

      // The single owning placement lives in the owning project.
      await tx.insert(schema.workItemPlacements).values({
        organizationId,
        workItemId: item.id,
        projectId: input.projectId,
        sectionId: input.sectionId,
        rank: rankBetween(null, null),
        isOwning: true,
        createdBy: userId,
      });

      await tx.insert(schema.activityEvents).values({
        organizationId,
        workItemId: item.id,
        projectId: input.projectId,
        actorUserId: userId,
        action: input.parentId ? "work_item.subtask_created" : "work_item.created",
        data: key,
      });
      return item;
    });
  }

  /** Resolves a human-readable key (e.g. "ENG-42") to its id — used by workflow simulation's test-item lookup. */
  async getByKey(organizationId: string, key: string) {
    const [item] = await this.db.select({ id: schema.workItems.id }).from(schema.workItems)
      .where(and(eq(schema.workItems.organizationId, organizationId), eq(schema.workItems.key, key.trim().toUpperCase()), isNull(schema.workItems.deletedAt))).limit(1);
    if (!item) throw new AppError("NOT_FOUND", `No work item with key "${key}"`);
    return item;
  }

  async get(organizationId: string, id: string) {
    const [item] = await this.db.select().from(schema.workItems)
      .where(and(eq(schema.workItems.id, id), eq(schema.workItems.organizationId, organizationId), isNull(schema.workItems.deletedAt))).limit(1);
    if (!item) throw new AppError("NOT_FOUND", "Work item not found");
    const [[type], [children], coAssignees] = await Promise.all([
      this.db.select({ key: schema.workItemTypes.key, name: schema.workItemTypes.name }).from(schema.workItemTypes)
        .where(and(eq(schema.workItemTypes.organizationId, organizationId), eq(schema.workItemTypes.id, item.typeId))).limit(1),
      this.db.select({ count: count() }).from(schema.workItems)
        .where(and(eq(schema.workItems.organizationId, organizationId), eq(schema.workItems.parentId, id), isNull(schema.workItems.deletedAt))),
      // ASN.D1/D2 — co-assignees are secondary to the Primary Owner; My Work
      // surfaces them separately and workload counts only explicit effort split.
      this.db.select({ userId: schema.workItemAssignees.userId, displayName: schema.users.displayName })
        .from(schema.workItemAssignees).innerJoin(schema.users, eq(schema.users.id, schema.workItemAssignees.userId))
        .where(and(eq(schema.workItemAssignees.organizationId, organizationId), eq(schema.workItemAssignees.workItemId, id))),
    ]);
    return { ...item, typeKey: type?.key ?? "task", typeName: type?.name ?? "Task", subtaskCount: Number(children?.count ?? 0), coAssignees };
  }

  listByProject(organizationId: string, projectId: string, opts: { limit?: number; offset?: number } = {}) {
    // Project views are placement based so multi-homed tasks appear in every linked project without duplicating identity.
    return this.db.select({
      id: schema.workItems.id, organizationId: schema.workItems.organizationId, workspaceId: schema.workItems.workspaceId, owningProjectId: schema.workItems.owningProjectId,
      typeId: schema.workItems.typeId, typeKey: schema.workItemTypes.key, typeName: schema.workItemTypes.name, parentId: schema.workItems.parentId, key: schema.workItems.key, title: schema.workItems.title, description: schema.workItems.description,
      statusCategory: schema.workItems.statusCategory, status: schema.workItems.status, priority: schema.workItems.priority, reporterUserId: schema.workItems.reporterUserId,
      primaryOwnerUserId: schema.workItems.primaryOwnerUserId, startDate: schema.workItems.startDate, dueDate: schema.workItems.dueDate, durationDays: schema.workItems.durationDays,
      scheduleMode: schema.workItems.scheduleMode, estimateMinutes: schema.workItems.estimateMinutes, storyPoints: schema.workItems.storyPoints, sprintId: schema.workItems.sprintId,
      backlogRank: schema.workItems.backlogRank, progress: schema.workItems.progress, publicToOrganization: schema.workItems.publicToOrganization,
      createdAt: schema.workItems.createdAt, createdBy: schema.workItems.createdBy, updatedAt: schema.workItems.updatedAt, updatedBy: schema.workItems.updatedBy,
      deletedAt: schema.workItems.deletedAt, deletedBy: schema.workItems.deletedBy, version: schema.workItems.version,
      placementId: schema.workItemPlacements.id, sectionId: schema.workItemPlacements.sectionId, placementRank: schema.workItemPlacements.rank, isOwningPlacement: schema.workItemPlacements.isOwning,
    }).from(schema.workItemPlacements).innerJoin(schema.workItems, eq(schema.workItems.id, schema.workItemPlacements.workItemId)).innerJoin(schema.workItemTypes, eq(schema.workItemTypes.id, schema.workItems.typeId))
      .where(and(eq(schema.workItemPlacements.organizationId, organizationId), eq(schema.workItemPlacements.projectId, projectId), isNull(schema.workItemPlacements.deletedAt), isNull(schema.workItems.deletedAt)))
      .orderBy(asc(schema.workItemPlacements.rank), desc(schema.workItems.createdAt))
      .limit(Math.min(opts.limit ?? 100, 500)).offset(opts.offset ?? 0);
  }

  listChildren(organizationId: string, parentId: string) {
    return this.db.select().from(schema.workItems)
      .where(and(eq(schema.workItems.organizationId, organizationId), eq(schema.workItems.parentId, parentId), isNull(schema.workItems.deletedAt)))
      .orderBy(asc(schema.workItems.createdAt));
  }

  /**
   * Field update with optimistic version precondition.
   * owning_project_id and parent_id are intentionally NOT accepted here.
   * Hierarchy changes go through the validated re-parent operation.
   */
  async update(organizationId: string, id: string, userId: string, expectedVersion: number, patch: Partial<{
    title: string;
    description: string;
    status: string;
    priority: string;
    startDate: string | null;
    dueDate: string | null;
    progress: number;
    primaryOwnerUserId: string | null;
    scheduleMode: string;
    durationDays: number | null;
    estimateMinutes: number | null;
    storyPoints: number | null;
  }>) {
    await this.assertAccess(organizationId, id, userId);
    if (patch.primaryOwnerUserId) await this.assertEligibleAssignee(this.db, organizationId, patch.primaryOwnerUserId);
    if (patch.title !== undefined && !patch.title.trim()) throw hierarchyError("Work item title is required", "WORK_ITEM_TITLE_REQUIRED");
    if (patch.status !== undefined && !ALLOWED_STATUS.has(patch.status)) throw hierarchyError("Status is not allowed", "WORK_ITEM_STATUS_NOT_ALLOWED");
    if (patch.status === "Done") {
      const [openChildren] = await this.db.select({ count: count() }).from(schema.workItems)
        .where(and(
          eq(schema.workItems.organizationId, organizationId),
          eq(schema.workItems.parentId, id),
          isNull(schema.workItems.deletedAt),
          sql`${schema.workItems.statusCategory} <> 'done'`,
        ));
      if (Number(openChildren?.count ?? 0) > 0) {
        throw hierarchyError("Complete the open subtasks before completing this task", "WORK_ITEM_OPEN_CHILDREN");
      }
    }
    const normalized = { ...patch, ...(patch.title !== undefined ? { title: patch.title.trim() } : {}) };
    const set: Record<string, unknown> = { ...normalized, updatedBy: userId, updatedAt: new Date(), version: sql`${schema.workItems.version} + 1` };
    let prevCategory: string | null = null;
    if (patch.status) {
      set.statusCategory = CATEGORY[patch.status];
      const [cur] = await this.db.select({ c: schema.workItems.statusCategory }).from(schema.workItems)
        .where(and(eq(schema.workItems.id, id), eq(schema.workItems.organizationId, organizationId))).limit(1);
      prevCategory = cur?.c ?? null;
    }

    const [row] = await this.db.update(schema.workItems).set(set)
      .where(and(eq(schema.workItems.id, id), eq(schema.workItems.organizationId, organizationId), eq(schema.workItems.version, expectedVersion), isNull(schema.workItems.deletedAt)))
      .returning();
    if (!row) throw new AppError("CONFLICT", "Work item was modified by someone else", { code: "WORK_ITEM_VERSION_CONFLICT" });

    if (patch.status && row.statusCategory !== prevCategory) {
      await this.db.insert(schema.workItemStatusHistory).values({ organizationId, workItemId: id, projectId: row.owningProjectId, fromCategory: prevCategory, toCategory: row.statusCategory });
    }

    await this.db.insert(schema.activityEvents).values({
      organizationId,
      workItemId: id,
      projectId: row.owningProjectId,
      actorUserId: userId,
      action: "work_item.updated",
      data: Object.keys(patch).join(","),
    });
    return row;
  }

  /** ASN.D4 — race-safe first-writer-wins claim of an unassigned (queue) item. */
  async claim(organizationId: string, workItemId: string, userId: string) {
    await this.assertAccess(organizationId, workItemId, userId);
    const [settings] = await this.db.select({ maxOpenClaimsPerUser: schema.organizationSettings.maxOpenClaimsPerUser }).from(schema.organizationSettings)
      .where(eq(schema.organizationSettings.organizationId, organizationId)).limit(1);
    if (settings?.maxOpenClaimsPerUser != null) {
      const [{ n }] = await this.db.select({ n: count() }).from(schema.workItems)
        .where(and(eq(schema.workItems.organizationId, organizationId), eq(schema.workItems.primaryOwnerUserId, userId), sql`${schema.workItems.statusCategory} <> 'done'`, isNull(schema.workItems.deletedAt)));
      if (Number(n) >= settings.maxOpenClaimsPerUser) throw new AppError("VALIDATION", `You already have ${settings.maxOpenClaimsPerUser} open claimed item(s), the organization's limit`, { code: "claim_limit_reached" });
    }
    // First-writer-wins: the WHERE clause only matches while the item is still unclaimed.
    const [row] = await this.db.update(schema.workItems)
      .set({ primaryOwnerUserId: userId, version: sql`${schema.workItems.version} + 1`, updatedBy: userId, updatedAt: new Date() })
      .where(and(eq(schema.workItems.id, workItemId), eq(schema.workItems.organizationId, organizationId), isNull(schema.workItems.primaryOwnerUserId), isNull(schema.workItems.deletedAt)))
      .returning({ id: schema.workItems.id, version: schema.workItems.version });
    if (!row) throw new AppError("CONFLICT", "Someone else already claimed this item", { code: "already_claimed" });
    await this.db.insert(schema.activityEvents).values({ organizationId, workItemId, actorUserId: userId, action: "work_item.claimed" });
    return row;
  }

  /** Release a claimed item back to the queue. Only the current claimant (or someone with edit access) can do this. */
  async unclaim(organizationId: string, workItemId: string, userId: string) {
    await this.assertAccess(organizationId, workItemId, userId);
    const [row] = await this.db.update(schema.workItems)
      .set({ primaryOwnerUserId: null, version: sql`${schema.workItems.version} + 1`, updatedBy: userId, updatedAt: new Date() })
      .where(and(eq(schema.workItems.id, workItemId), eq(schema.workItems.organizationId, organizationId), eq(schema.workItems.primaryOwnerUserId, userId), isNull(schema.workItems.deletedAt)))
      .returning({ id: schema.workItems.id });
    if (!row) throw new AppError("VALIDATION", "You are not the current claimant of this item");
    await this.db.insert(schema.activityEvents).values({ organizationId, workItemId, actorUserId: userId, action: "work_item.unclaimed" });
    return { ok: true };
  }

  async assign(organizationId: string, workItemId: string, userId: string, assigneeUserId: string) {
    await this.assertAccess(organizationId, workItemId, userId);
    const [settings] = await this.db.select({ coAssigneesEnabled: schema.organizationSettings.coAssigneesEnabled }).from(schema.organizationSettings)
      .where(eq(schema.organizationSettings.organizationId, organizationId)).limit(1);
    if (!settings?.coAssigneesEnabled) throw new AppError("FORBIDDEN", "Co-assignees are not enabled for this organization", { code: "co_assignees_disabled" });
    await this.assertEligibleAssignee(this.db, organizationId, assigneeUserId);
    await this.db.insert(schema.workItemAssignees)
      .values({ organizationId, workItemId, userId: assigneeUserId }).onConflictDoNothing();
    await this.db.insert(schema.activityEvents).values({ organizationId, workItemId, actorUserId: userId, action: "work_item.assigned", data: assigneeUserId });
  }

  async unassign(organizationId: string, workItemId: string, userId: string, assigneeUserId: string) {
    await this.assertAccess(organizationId, workItemId, userId);
    await this.db.delete(schema.workItemAssignees)
      .where(and(eq(schema.workItemAssignees.workItemId, workItemId), eq(schema.workItemAssignees.userId, assigneeUserId), eq(schema.workItemAssignees.organizationId, organizationId)));
  }

  async softDelete(organizationId: string, id: string, userId: string) {
    await this.assertAccess(organizationId, id, userId);
    const [children] = await this.db.select({ count: count() }).from(schema.workItems)
      .where(and(eq(schema.workItems.organizationId, organizationId), eq(schema.workItems.parentId, id), isNull(schema.workItems.deletedAt)));
    if (Number(children?.count ?? 0) > 0) {
      throw hierarchyError("This task has active subtasks. Delete or promote them before deleting the parent task", "WORK_ITEM_OPEN_CHILDREN");
    }
    await this.db.update(schema.workItems).set({ deletedAt: new Date(), deletedBy: userId })
      .where(and(eq(schema.workItems.id, id), eq(schema.workItems.organizationId, organizationId)));
    await this.db.insert(schema.activityEvents).values({ organizationId, workItemId: id, actorUserId: userId, action: "work_item.deleted" });
  }

  async restore(organizationId: string, id: string, userId: string) {
    await this.assertAccess(organizationId, id, userId);
    const [item] = await this.db.select({ owningProjectId: schema.workItems.owningProjectId }).from(schema.workItems)
      .where(and(eq(schema.workItems.id, id), eq(schema.workItems.organizationId, organizationId))).limit(1);
    if (!item) throw new AppError("NOT_FOUND", "Work item not found");
    await this.db.update(schema.workItems).set({ deletedAt: null, deletedBy: null })
      .where(and(eq(schema.workItems.id, id), eq(schema.workItems.organizationId, organizationId)));
    await this.db.insert(schema.activityEvents).values({ organizationId, workItemId: id, projectId: item.owningProjectId, actorUserId: userId, action: "work_item.restored" });
  }

  activity(organizationId: string, workItemId: string) {
    return this.db.select().from(schema.activityEvents)
      .where(and(eq(schema.activityEvents.organizationId, organizationId), eq(schema.activityEvents.workItemId, workItemId)))
      .orderBy(desc(schema.activityEvents.createdAt)).limit(100);
  }
}
