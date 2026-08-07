import { Injectable, Inject } from "@nestjs/common";
import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { schema, type Database } from "@pm/db";
import { AppError } from "@pm/shared";
import { DB } from "../db/db.module.js";

const dayDiff = (a: string | null, b: string | null): number | null =>
  a && b ? Math.round((new Date(b + "T00:00:00Z").getTime() - new Date(a + "T00:00:00Z").getTime()) / 86_400_000) : null;

@Injectable()
export class BaselineService {
  constructor(@Inject(DB) private readonly db: Database) {}

  /** Snapshot current start/due for every item in the project. */
  async capture(organizationId: string, userId: string, projectId: string, name: string) {
    const items = await this.db.select().from(schema.workItems)
      .where(and(eq(schema.workItems.organizationId, organizationId), eq(schema.workItems.owningProjectId, projectId), isNull(schema.workItems.deletedAt)));
    const snapshot = items.map((i) => ({ itemId: i.id, startDate: i.startDate, dueDate: i.dueDate }));
    const [b] = await this.db.insert(schema.scheduleBaselines).values({ organizationId, projectId, name, snapshot }).returning();
    return { id: b.id, name: b.name, capturedItems: snapshot.length };
  }

  list(organizationId: string, projectId: string) {
    return this.db.select({ id: schema.scheduleBaselines.id, name: schema.scheduleBaselines.name, createdAt: schema.scheduleBaselines.createdAt })
      .from(schema.scheduleBaselines)
      .where(and(eq(schema.scheduleBaselines.organizationId, organizationId), eq(schema.scheduleBaselines.projectId, projectId)))
      .orderBy(desc(schema.scheduleBaselines.createdAt));
  }

  /** Per-item slippage: current dates vs a captured baseline. */
  async variance(organizationId: string, projectId: string, baselineId: string) {
    const [b] = await this.db.select().from(schema.scheduleBaselines)
      .where(and(eq(schema.scheduleBaselines.id, baselineId), eq(schema.scheduleBaselines.organizationId, organizationId))).limit(1);
    if (!b) throw new AppError("NOT_FOUND", "Baseline not found");
    const base = new Map((b.snapshot as { itemId: string; startDate: string | null; dueDate: string | null }[]).map((s) => [s.itemId, s]));
    const items = await this.db.select().from(schema.workItems)
      .where(and(eq(schema.workItems.organizationId, organizationId), eq(schema.workItems.owningProjectId, projectId), isNull(schema.workItems.deletedAt)));
    return items.map((i) => {
      const bl = base.get(i.id);
      return {
        itemId: i.id, key: i.key, title: i.title,
        baselineStart: bl?.startDate ?? null, currentStart: i.startDate, startVarianceDays: dayDiff(bl?.startDate ?? null, i.startDate),
        baselineDue: bl?.dueDate ?? null, currentDue: i.dueDate, dueVarianceDays: dayDiff(bl?.dueDate ?? null, i.dueDate),
      };
    });
  }
}
