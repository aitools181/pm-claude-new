import { Injectable, Inject } from "@nestjs/common";
import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { schema, type Database } from "@pm/db";
import { AppError } from "@pm/shared";
import { DB } from "../db/db.module.js";
import { canAccessWorkItem, canAccessProject } from "../collab/access.js";
import { computeProgress, expectedProgress, health, type GoalCore } from "./goal-logic.js";

type GoalRow = typeof schema.goals.$inferSelect;

@Injectable()
export class GoalsService {
  constructor(@Inject(DB) private readonly db: Database) {}

  create(organizationId: string, userId: string, input: { name: string; description?: string; parentId?: string; ownerUserId?: string; targetType?: string; startValue?: number; targetValue?: number; currentValue?: number; unit?: string; dueDate?: string }) {
    return this.db.insert(schema.goals).values({
      organizationId, name: input.name, description: input.description ?? null, parentId: input.parentId ?? null,
      ownerUserId: input.ownerUserId ?? userId, targetType: input.targetType ?? "percent",
      startValue: input.startValue ?? null, targetValue: input.targetValue ?? null, currentValue: input.currentValue ?? null,
      unit: input.unit ?? null, dueDate: input.dueDate ?? null,
    }).returning().then((r) => r[0]);
  }

  private core(g: GoalRow): GoalCore { return { targetType: g.targetType as any, startValue: g.startValue, targetValue: g.targetValue, currentValue: g.currentValue, confidence: g.confidence as any, status: g.status }; }

  /** done/total across a goal's project + work-item links. */
  private async workStats(organizationId: string, goalId: string) {
    const links = await this.db.select().from(schema.goalLinks).where(and(eq(schema.goalLinks.organizationId, organizationId), eq(schema.goalLinks.goalId, goalId)));
    let done = 0, total = 0;
    const itemIds = links.filter((l) => l.kind === "work_item").map((l) => l.refId);
    if (itemIds.length) {
      const its = await this.db.select({ c: schema.workItems.statusCategory }).from(schema.workItems).where(inArray(schema.workItems.id, itemIds));
      total += its.length; done += its.filter((i) => i.c === "done").length;
    }
    for (const l of links.filter((x) => x.kind === "project")) {
      const its = await this.db.select({ c: schema.workItems.statusCategory }).from(schema.workItems)
        .where(and(eq(schema.workItems.owningProjectId, l.refId), isNull(schema.workItems.deletedAt)));
      total += its.length; done += its.filter((i) => i.c === "done").length;
    }
    return { done, total };
  }

  /** Recursive progress: rollup(children) > linked work > leaf formula. */
  private async progressOf(organizationId: string, goalId: string, byId: Map<string, GoalRow>, children: Map<string, string[]>, memo: Map<string, number>): Promise<number> {
    if (memo.has(goalId)) return memo.get(goalId)!;
    const g = byId.get(goalId)!;
    let progress: number;
    if (g.targetType === "rollup") {
      const kids = children.get(goalId) ?? [];
      const cp: number[] = [];
      for (const k of kids) cp.push(await this.progressOf(organizationId, k, byId, children, memo));
      progress = computeProgress(this.core(g), { childProgress: cp });
    } else {
      const work = await this.workStats(organizationId, goalId);
      progress = computeProgress(this.core(g), work.total > 0 ? { work } : {});
    }
    memo.set(goalId, progress); return progress;
  }

  private async decorate(organizationId: string, goals: GoalRow[]) {
    const byId = new Map(goals.map((g) => [g.id, g]));
    const children = new Map<string, string[]>();
    for (const g of goals) if (g.parentId) children.set(g.parentId, [...(children.get(g.parentId) ?? []), g.id]);
    const memo = new Map<string, number>();
    const out = [];
    for (const g of goals) {
      const progress = await this.progressOf(organizationId, g.id, byId, children, memo);
      const expected = expectedProgress(g.createdAt as unknown as Date, g.dueDate);
      out.push({ id: g.id, parentId: g.parentId, name: g.name, ownerUserId: g.ownerUserId, targetType: g.targetType, unit: g.unit, currentValue: g.currentValue, targetValue: g.targetValue, confidence: g.confidence, status: g.status, dueDate: g.dueDate, progress, expectedProgress: expected, health: health(progress, this.core(g), expected) });
    }
    return out;
  }

  async list(organizationId: string) {
    const goals = await this.db.select().from(schema.goals).where(eq(schema.goals.organizationId, organizationId)).orderBy(schema.goals.createdAt);
    return this.decorate(organizationId, goals);
  }

  async get(organizationId: string, userId: string, id: string) {
    const all = await this.db.select().from(schema.goals).where(eq(schema.goals.organizationId, organizationId));
    const decorated = await this.decorate(organizationId, all);
    const goal = decorated.find((g) => g.id === id);
    if (!goal) throw new AppError("NOT_FOUND", "Goal not found");
    const links = await this.db.select().from(schema.goalLinks).where(and(eq(schema.goalLinks.organizationId, organizationId), eq(schema.goalLinks.goalId, id)));
    const redactedLinks = [];
    for (const l of links) {
      let name = "", visible = true;
      if (l.kind === "work_item") { visible = await canAccessWorkItem(this.db, organizationId, l.refId, userId); if (visible) { const [w] = await this.db.select({ key: schema.workItems.key, title: schema.workItems.title }).from(schema.workItems).where(eq(schema.workItems.id, l.refId)).limit(1); name = w ? `${w.key} ${w.title}` : ""; } }
      else if (l.kind === "project") { visible = await canAccessProject(this.db, organizationId, l.refId, userId); if (visible) { const [p] = await this.db.select({ name: schema.projects.name }).from(schema.projects).where(eq(schema.projects.id, l.refId)).limit(1); name = p?.name ?? ""; } }
      else name = "metric";
      redactedLinks.push({ id: l.id, kind: l.kind, refId: visible ? l.refId : null, name: visible ? name : "Restricted", redacted: !visible });
    }
    const updates = await this.db.select().from(schema.goalUpdates).where(and(eq(schema.goalUpdates.organizationId, organizationId), eq(schema.goalUpdates.goalId, id))).orderBy(desc(schema.goalUpdates.at));
    return { goal, links: redactedLinks, updates };
  }

  async update(organizationId: string, id: string, patch: Partial<{ name: string; description: string; targetType: string; startValue: number; targetValue: number; unit: string; dueDate: string; status: string; parentId: string | null }>) {
    const [row] = await this.db.update(schema.goals).set(patch).where(and(eq(schema.goals.id, id), eq(schema.goals.organizationId, organizationId))).returning();
    if (!row) throw new AppError("NOT_FOUND", "Goal not found");
    return row;
  }

  /** Owner check-in: records an immutable update and moves current value/confidence. */
  async checkIn(organizationId: string, userId: string, id: string, input: { currentValue?: number; confidence?: string; note?: string }) {
    const [g] = await this.db.select().from(schema.goals).where(and(eq(schema.goals.id, id), eq(schema.goals.organizationId, organizationId))).limit(1);
    if (!g) throw new AppError("NOT_FOUND", "Goal not found");
    const currentValue = input.currentValue ?? g.currentValue;
    const confidence = input.confidence ?? g.confidence;
    return this.db.transaction(async (tx) => {
      const [updated] = await tx.update(schema.goals).set({ currentValue, confidence }).where(eq(schema.goals.id, id)).returning();
      const work = await this.workStats(organizationId, id);
      const progress = computeProgress(this.core(updated), work.total > 0 ? { work } : {});
      await tx.insert(schema.goalUpdates).values({ organizationId, goalId: id, currentValue, progress, confidence, note: input.note ?? null, actorUserId: userId });
      return { currentValue, confidence, progress };
    });
  }

  async addLink(organizationId: string, goalId: string, kind: string, refId: string, weight = 1) {
    await this.db.insert(schema.goalLinks).values({ organizationId, goalId, kind, refId, weight });
    return { linked: true };
  }
  async removeLink(organizationId: string, linkId: string) {
    await this.db.delete(schema.goalLinks).where(and(eq(schema.goalLinks.id, linkId), eq(schema.goalLinks.organizationId, organizationId)));
    return { removed: true };
  }
}
