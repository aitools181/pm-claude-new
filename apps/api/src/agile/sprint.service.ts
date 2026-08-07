import { Injectable, Inject } from "@nestjs/common";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { schema, type Database } from "@pm/db";
import { AppError } from "@pm/shared";
import { DB } from "../db/db.module.js";

const pts = (items: { storyPoints: number | null }[]) => items.reduce((s, i) => s + (i.storyPoints ?? 0), 0);
const today = () => new Date().toISOString().slice(0, 10);

@Injectable()
export class SprintService {
  constructor(@Inject(DB) private readonly db: Database) {}

  create(organizationId: string, projectId: string, input: { name: string; goal?: string; startDate?: string; endDate?: string }) {
    return this.db.insert(schema.sprints).values({ organizationId, projectId, name: input.name, goal: input.goal ?? null, startDate: input.startDate ?? null, endDate: input.endDate ?? null })
      .returning().then((r) => r[0]);
  }
  list(organizationId: string, projectId: string) {
    return this.db.select().from(schema.sprints).where(and(eq(schema.sprints.organizationId, organizationId), eq(schema.sprints.projectId, projectId))).orderBy(schema.sprints.createdAt);
  }
  private async load(organizationId: string, sprintId: string) {
    const [s] = await this.db.select().from(schema.sprints).where(and(eq(schema.sprints.id, sprintId), eq(schema.sprints.organizationId, organizationId))).limit(1);
    if (!s) throw new AppError("NOT_FOUND", "Sprint not found");
    return s;
  }
  private sprintItems(organizationId: string, sprintId: string) {
    return this.db.select().from(schema.workItems).where(and(eq(schema.workItems.organizationId, organizationId), eq(schema.workItems.sprintId, sprintId), isNull(schema.workItems.deletedAt)));
  }

  async get(organizationId: string, sprintId: string) {
    const sprint = await this.load(organizationId, sprintId);
    const items = await this.sprintItems(organizationId, sprintId);
    return { sprint, items: items.map((i) => ({ id: i.id, key: i.key, title: i.title, statusCategory: i.statusCategory, storyPoints: i.storyPoints })), points: pts(items) };
  }

  async addItem(organizationId: string, userId: string, sprintId: string, workItemId: string) {
    const sprint = await this.load(organizationId, sprintId);
    if (sprint.state === "closed") throw new AppError("CONFLICT", "Sprint is closed");
    const [item] = await this.db.update(schema.workItems).set({ sprintId }).where(and(eq(schema.workItems.id, workItemId), eq(schema.workItems.organizationId, organizationId))).returning();
    if (!item) throw new AppError("NOT_FOUND", "Work item not found");
    if (sprint.state === "active") await this.db.insert(schema.sprintScopeEvents).values({ organizationId, sprintId, workItemId, type: "added", points: item.storyPoints, actorUserId: userId });
    return { added: true };
  }

  async removeItem(organizationId: string, userId: string, sprintId: string, workItemId: string) {
    const sprint = await this.load(organizationId, sprintId);
    if (sprint.state === "closed") throw new AppError("CONFLICT", "Sprint is closed");
    const [item] = await this.db.select().from(schema.workItems).where(and(eq(schema.workItems.id, workItemId), eq(schema.workItems.organizationId, organizationId))).limit(1);
    await this.db.update(schema.workItems).set({ sprintId: null }).where(and(eq(schema.workItems.id, workItemId), eq(schema.workItems.organizationId, organizationId)));
    if (sprint.state === "active") await this.db.insert(schema.sprintScopeEvents).values({ organizationId, sprintId, workItemId, type: "removed", points: item?.storyPoints ?? null, actorUserId: userId });
    return { removed: true };
  }

  /** Start: freeze the committed baseline (item ids + points). */
  async start(organizationId: string, sprintId: string) {
    const sprint = await this.load(organizationId, sprintId);
    if (sprint.state !== "planned") throw new AppError("CONFLICT", `Sprint is ${sprint.state}`);
    const items = await this.sprintItems(organizationId, sprintId);
    const [row] = await this.db.update(schema.sprints)
      .set({ state: "active", startedAt: new Date(), startDate: sprint.startDate ?? today(), committedItemIds: items.map((i) => i.id), committedPoints: pts(items) })
      .where(and(eq(schema.sprints.id, sprintId), eq(schema.sprints.state, "planned"))).returning();
    if (!row) throw new AppError("CONFLICT", "Sprint changed concurrently");
    return row;
  }

  /** Close: compute completed vs committed, carry over incomplete, freeze an immutable report. */
  async close(organizationId: string, sprintId: string, opts: { carryOverToSprintId?: string | null } = {}) {
    const sprint = await this.load(organizationId, sprintId);
    if (sprint.state !== "active") throw new AppError("CONFLICT", `Sprint is ${sprint.state}`);
    const items = await this.sprintItems(organizationId, sprintId);
    const committedIds = new Set((sprint.committedItemIds as string[]) ?? []);
    const committedPoints = sprint.committedPoints ?? 0;

    const completed = items.filter((i) => i.statusCategory === "done");
    const incomplete = items.filter((i) => i.statusCategory !== "done");
    const completedPoints = pts(completed);
    const committedCompletedPoints = pts(completed.filter((i) => committedIds.has(i.id)));
    const addedPoints = pts(items.filter((i) => !committedIds.has(i.id)));
    const scopeRemoved = await this.db.select().from(schema.sprintScopeEvents).where(and(eq(schema.sprintScopeEvents.sprintId, sprintId), eq(schema.sprintScopeEvents.type, "removed")));
    const removedPoints = scopeRemoved.reduce((s, e) => s + (e.points ?? 0), 0);
    const carriedOverPoints = pts(incomplete);
    const closeDate = today();
    const burndown = [
      { date: sprint.startDate ?? closeDate, remaining: committedPoints },
      { date: closeDate, remaining: Math.max(0, committedPoints - committedCompletedPoints) },
    ];

    return this.db.transaction(async (tx) => {
      await tx.insert(schema.sprintReports).values({
        organizationId, sprintId, committedPoints, completedPoints, addedPoints, removedPoints, carriedOverPoints,
        completedItemCount: completed.length, totalItemCount: items.length, burndown,
      });
      // carry over incomplete items to a target sprint, else back to the backlog
      const target = opts.carryOverToSprintId ?? null;
      if (incomplete.length) await tx.update(schema.workItems).set({ sprintId: target }).where(inArray(schema.workItems.id, incomplete.map((i) => i.id)));
      const [row] = await tx.update(schema.sprints).set({ state: "closed", closedAt: new Date(), endDate: sprint.endDate ?? closeDate }).where(eq(schema.sprints.id, sprintId)).returning();
      return { sprint: row, report: { committedPoints, completedPoints, addedPoints, removedPoints, carriedOverPoints, carriedItems: incomplete.length } };
    });
  }

  scopeEvents(organizationId: string, sprintId: string) {
    return this.db.select().from(schema.sprintScopeEvents).where(and(eq(schema.sprintScopeEvents.organizationId, organizationId), eq(schema.sprintScopeEvents.sprintId, sprintId))).orderBy(schema.sprintScopeEvents.at);
  }
}
