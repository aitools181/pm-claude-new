import { Injectable, Inject } from "@nestjs/common";
import { and, eq, isNull, asc, count, sql } from "drizzle-orm";
import { schema, type Database } from "@pm/db";
import { AppError } from "@pm/shared";
import { DB } from "../db/db.module.js";
import { rankBetween } from "./rank.js";
import { canAccessProject, canAccessWorkItem } from "../collab/access.js";

const CATEGORY: Record<string, "todo" | "in_progress" | "done"> = { "To Do": "todo", "In Progress": "in_progress", "Done": "done" };

@Injectable()
export class BoardService {
  constructor(@Inject(DB) private readonly db: Database) {}

  private async placementRank(organizationId: string, projectId: string, workItemId: string): Promise<string | null> {
    const [p] = await this.db.select({ rank: schema.workItemPlacements.rank }).from(schema.workItemPlacements)
      .where(and(
        eq(schema.workItemPlacements.organizationId, organizationId),
        eq(schema.workItemPlacements.projectId, projectId),
        eq(schema.workItemPlacements.workItemId, workItemId),
        isNull(schema.workItemPlacements.deletedAt),
      )).limit(1);
    return p?.rank ?? null;
  }

  private async assertCanSetStatus(organizationId: string, workItemId: string, status: string) {
    if (status !== "Done") return;
    const [openChildren] = await this.db.select({ count: count() }).from(schema.workItems)
      .where(and(
        eq(schema.workItems.organizationId, organizationId),
        eq(schema.workItems.parentId, workItemId),
        isNull(schema.workItems.deletedAt),
        sql`${schema.workItems.statusCategory} <> 'done'`,
      ));
    if (Number(openChildren?.count ?? 0) > 0) {
      throw new AppError("VALIDATION", "Complete the open subtasks before completing this task", { code: "WORK_ITEM_OPEN_CHILDREN" });
    }
  }

  /** Move on the board: change column (status) and/or position (rank). Returns prior state for undo. */
  async move(organizationId: string, userId: string, projectId: string, workItemId: string, input: { toStatus?: string; beforeId?: string; afterId?: string; expectedVersion: number }) {
    if (!(await canAccessProject(this.db, organizationId, projectId, userId))) throw new AppError("FORBIDDEN", "No access to this project");
    if (!(await canAccessWorkItem(this.db, organizationId, workItemId, userId))) throw new AppError("FORBIDDEN", "No access to this work item");
    if (input.toStatus && !Object.prototype.hasOwnProperty.call(CATEGORY, input.toStatus)) throw new AppError("VALIDATION", "Board status is not allowed");

    const [placement] = await this.db.select({ id: schema.workItemPlacements.id, rank: schema.workItemPlacements.rank }).from(schema.workItemPlacements)
      .where(and(
        eq(schema.workItemPlacements.organizationId, organizationId),
        eq(schema.workItemPlacements.projectId, projectId),
        eq(schema.workItemPlacements.workItemId, workItemId),
        isNull(schema.workItemPlacements.deletedAt),
      )).limit(1);
    if (!placement) throw new AppError("NOT_FOUND", "This work item is not placed in the selected project");

    const [item] = await this.db.select().from(schema.workItems)
      .where(and(eq(schema.workItems.id, workItemId), eq(schema.workItems.organizationId, organizationId), isNull(schema.workItems.deletedAt))).limit(1);
    if (!item) throw new AppError("NOT_FOUND", "Work item not found");
    if (input.toStatus) await this.assertCanSetStatus(organizationId, workItemId, input.toStatus);

    const previous = { status: item.status, statusCategory: item.statusCategory, rank: placement.rank };
    const before = input.beforeId ? await this.placementRank(organizationId, projectId, input.beforeId) : null;
    const after = input.afterId ? await this.placementRank(organizationId, projectId, input.afterId) : null;
    const newRank = input.beforeId || input.afterId ? rankBetween(before, after) : placement.rank ?? rankBetween(null, null);
    const nextCategory = input.toStatus ? (CATEGORY[input.toStatus] ?? item.statusCategory) : item.statusCategory;
    const statusChanged = Boolean(input.toStatus && (input.toStatus !== item.status || nextCategory !== item.statusCategory));

    // VIEW.D3 — WIP limit check: only relevant when the card is entering a
    // *different* column with a configured limit; moving within the same
    // column (reorder) never trips it.
    let wipWarning: { statusCategory: string; limit: number; count: number } | null = null;
    if (statusChanged && nextCategory !== item.statusCategory) {
      const [proj] = await this.db.select({ wipLimits: schema.projects.wipLimits }).from(schema.projects).where(eq(schema.projects.id, projectId)).limit(1);
      const limits = (proj?.wipLimits ?? {}) as Record<string, { limit: number; warnOnly: boolean }>;
      const rule = limits[nextCategory];
      if (rule) {
        const [{ n }] = await this.db.select({ n: count() }).from(schema.workItemPlacements)
          .innerJoin(schema.workItems, eq(schema.workItems.id, schema.workItemPlacements.workItemId))
          .where(and(
            eq(schema.workItemPlacements.organizationId, organizationId), eq(schema.workItemPlacements.projectId, projectId),
            isNull(schema.workItemPlacements.deletedAt), eq(schema.workItems.statusCategory, nextCategory), isNull(schema.workItems.deletedAt),
          ));
        const currentCount = Number(n ?? 0);
        if (currentCount >= rule.limit) {
          if (!rule.warnOnly) throw new AppError("VALIDATION", `The "${input.toStatus}" column is at its WIP limit of ${rule.limit}`, { code: "wip_limit_exceeded" });
          wipWarning = { statusCategory: nextCategory, limit: rule.limit, count: currentCount };
        }
      }
    }

    let resultingVersion = item.version;
    await this.db.transaction(async (tx) => {
      if (statusChanged && input.toStatus) {
        const [updated] = await tx.update(schema.workItems)
          .set({
            status: input.toStatus,
            statusCategory: nextCategory,
            updatedBy: userId,
            updatedAt: new Date(),
            version: sql`${schema.workItems.version} + 1`,
          })
          .where(and(
            eq(schema.workItems.id, workItemId),
            eq(schema.workItems.organizationId, organizationId),
            eq(schema.workItems.version, input.expectedVersion),
            isNull(schema.workItems.deletedAt),
          ))
          .returning({ owningProjectId: schema.workItems.owningProjectId, version: schema.workItems.version });
        if (!updated) throw new AppError("CONFLICT", "Work item was modified by someone else", { code: "WORK_ITEM_VERSION_CONFLICT" });
        resultingVersion = updated.version;
        if (nextCategory !== item.statusCategory) {
          await tx.insert(schema.workItemStatusHistory).values({
            organizationId,
            workItemId,
            projectId: updated.owningProjectId,
            fromCategory: item.statusCategory,
            toCategory: nextCategory,
          });
        }
      }

      await tx.update(schema.workItemPlacements).set({ rank: newRank })
        .where(and(
          eq(schema.workItemPlacements.organizationId, organizationId),
          eq(schema.workItemPlacements.projectId, projectId),
          eq(schema.workItemPlacements.workItemId, workItemId),
          isNull(schema.workItemPlacements.deletedAt),
        ));

      await tx.insert(schema.activityEvents).values({
        organizationId,
        workItemId,
        projectId,
        actorUserId: userId,
        action: "board.moved",
        data: input.toStatus ?? "reorder",
      });
    });

    return { newRank, previous, version: resultingVersion, wipWarning };
  }

  /** Re-apply a captured prior state — this is how undo works. */
  async undo(organizationId: string, userId: string, projectId: string, workItemId: string, previous: { status: string; rank: string | null }, expectedVersion: number) {
    if (!(await canAccessProject(this.db, organizationId, projectId, userId))) throw new AppError("FORBIDDEN", "No access to this project");
    if (!(await canAccessWorkItem(this.db, organizationId, workItemId, userId))) throw new AppError("FORBIDDEN", "No access to this work item");
    if (!Object.prototype.hasOwnProperty.call(CATEGORY, previous.status)) throw new AppError("VALIDATION", "Undo status is not allowed");
    await this.assertCanSetStatus(organizationId, workItemId, previous.status);

    const [placement] = await this.db.select({ id: schema.workItemPlacements.id }).from(schema.workItemPlacements)
      .where(and(
        eq(schema.workItemPlacements.organizationId, organizationId),
        eq(schema.workItemPlacements.projectId, projectId),
        eq(schema.workItemPlacements.workItemId, workItemId),
        isNull(schema.workItemPlacements.deletedAt),
      )).limit(1);
    if (!placement) throw new AppError("NOT_FOUND", "This work item is not placed in the selected project");

    const [item] = await this.db.select().from(schema.workItems)
      .where(and(eq(schema.workItems.id, workItemId), eq(schema.workItems.organizationId, organizationId), isNull(schema.workItems.deletedAt))).limit(1);
    if (!item) throw new AppError("NOT_FOUND", "Work item not found");

    const nextCategory = CATEGORY[previous.status] ?? "todo";
    const statusChanged = previous.status !== item.status || nextCategory !== item.statusCategory;
    await this.db.transaction(async (tx) => {
      if (statusChanged) {
        const [updated] = await tx.update(schema.workItems).set({
          status: previous.status,
          statusCategory: nextCategory,
          updatedBy: userId,
          updatedAt: new Date(),
          version: sql`${schema.workItems.version} + 1`,
        })
          .where(and(
            eq(schema.workItems.id, workItemId),
            eq(schema.workItems.organizationId, organizationId),
            eq(schema.workItems.version, expectedVersion),
            isNull(schema.workItems.deletedAt),
          ))
          .returning({ owningProjectId: schema.workItems.owningProjectId });
        if (!updated) throw new AppError("CONFLICT", "Work item was modified by someone else", { code: "WORK_ITEM_VERSION_CONFLICT" });
        if (nextCategory !== item.statusCategory) {
          await tx.insert(schema.workItemStatusHistory).values({
            organizationId,
            workItemId,
            projectId: updated.owningProjectId,
            fromCategory: item.statusCategory,
            toCategory: nextCategory,
          });
        }
      }

      if (previous.rank) {
        await tx.update(schema.workItemPlacements).set({ rank: previous.rank })
          .where(and(
            eq(schema.workItemPlacements.organizationId, organizationId),
            eq(schema.workItemPlacements.projectId, projectId),
            eq(schema.workItemPlacements.workItemId, workItemId),
            isNull(schema.workItemPlacements.deletedAt),
          ));
      }
      await tx.insert(schema.activityEvents).values({ organizationId, workItemId, projectId, actorUserId: userId, action: "board.move_undone" });
    });
  }

  /** Board columns for a project, including accessible linked items. */
  async board(organizationId: string, userId: string, projectId: string) {
    if (!(await canAccessProject(this.db, organizationId, projectId, userId))) throw new AppError("FORBIDDEN", "No access to this project");
    const rows = await this.db.select({
      item: schema.workItems, rank: schema.workItemPlacements.rank, isOwning: schema.workItemPlacements.isOwning,
    }).from(schema.workItemPlacements)
      .innerJoin(schema.workItems, eq(schema.workItems.id, schema.workItemPlacements.workItemId))
      .where(and(
        eq(schema.workItemPlacements.projectId, projectId),
        eq(schema.workItemPlacements.organizationId, organizationId),
        isNull(schema.workItemPlacements.deletedAt),
        isNull(schema.workItems.deletedAt),
      ))
      .orderBy(asc(schema.workItemPlacements.rank));

    // Linking does NOT grant access: filter linked items by access to their owning project.
    const visible = [];
    for (const r of rows) {
      if (r.isOwning || await canAccessWorkItem(this.db, organizationId, r.item.id, userId)) visible.push(r);
    }
    const columns: Record<string, unknown[]> = { todo: [], in_progress: [], done: [] };
    for (const r of visible) (columns[r.item.statusCategory] ??= []).push({ ...r.item, rank: r.rank, linked: !r.isOwning });
    return columns;
  }
}
