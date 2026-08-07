import { Injectable, Inject } from "@nestjs/common";
import { and, eq, gte, lte, sql } from "drizzle-orm";
import { schema, type Database } from "@pm/db";
import { AppError } from "@pm/shared";
import { DB } from "../db/db.module.js";
import { mondayOf, weekEnd, IMMUTABLE_STATUSES } from "./week.js";

@Injectable()
export class TimeEntriesService {
  constructor(@Inject(DB) private readonly db: Database) {}

  /** Throw if the week's timesheet is submitted/approved/locked. */
  private async assertWeekMutable(organizationId: string, userId: string, date: string) {
    const [ts] = await this.db.select().from(schema.timesheets)
      .where(and(eq(schema.timesheets.organizationId, organizationId), eq(schema.timesheets.userId, userId), eq(schema.timesheets.weekStart, mondayOf(date)))).limit(1);
    if (ts && IMMUTABLE_STATUSES.includes(ts.status)) throw new AppError("CONFLICT", `This week's timesheet is ${ts.status} and cannot be changed`, { code: "week_locked" });
  }

  async create(organizationId: string, userId: string, input: { date: string; minutes: number; workItemId?: string; projectId?: string; description?: string; billable?: boolean }) {
    if (!input.minutes || input.minutes <= 0) throw new AppError("VALIDATION", "minutes must be positive");
    if (input.minutes > 24 * 60) throw new AppError("VALIDATION", "minutes cannot exceed a full day");
    await this.assertWeekMutable(organizationId, userId, input.date);
    const [e] = await this.db.insert(schema.timeEntries).values({
      organizationId, userId, date: input.date, minutes: input.minutes,
      workItemId: input.workItemId ?? null, projectId: input.projectId ?? null,
      description: input.description ?? null, billable: input.billable ?? true, source: "manual",
    }).returning();
    return e;
  }

  private async load(organizationId: string, id: string) {
    const [e] = await this.db.select().from(schema.timeEntries)
      .where(and(eq(schema.timeEntries.id, id), eq(schema.timeEntries.organizationId, organizationId))).limit(1);
    if (!e) throw new AppError("NOT_FOUND", "Time entry not found");
    return e;
  }

  async update(organizationId: string, userId: string, id: string, patch: { minutes?: number; date?: string; description?: string; billable?: boolean }) {
    const e = await this.load(organizationId, id);
    if (e.userId !== userId) throw new AppError("FORBIDDEN", "Not your time entry");
    await this.assertWeekMutable(organizationId, userId, e.date);               // current week
    if (patch.date) await this.assertWeekMutable(organizationId, userId, patch.date); // target week
    if (patch.minutes != null && patch.minutes <= 0) throw new AppError("VALIDATION", "minutes must be positive");
    const [row] = await this.db.update(schema.timeEntries)
      .set({ ...patch, updatedAt: new Date() })
      .where(and(eq(schema.timeEntries.id, id), eq(schema.timeEntries.organizationId, organizationId))).returning();
    return row;
  }

  async remove(organizationId: string, userId: string, id: string) {
    const e = await this.load(organizationId, id);
    if (e.userId !== userId) throw new AppError("FORBIDDEN", "Not your time entry");
    await this.assertWeekMutable(organizationId, userId, e.date);
    await this.db.delete(schema.timeEntries).where(and(eq(schema.timeEntries.id, id), eq(schema.timeEntries.organizationId, organizationId)));
    return { deleted: true };
  }

  listWeek(organizationId: string, userId: string, weekStart: string) {
    return this.db.select().from(schema.timeEntries)
      .where(and(eq(schema.timeEntries.organizationId, organizationId), eq(schema.timeEntries.userId, userId),
        gte(schema.timeEntries.date, weekStart), lte(schema.timeEntries.date, weekEnd(weekStart))))
      .orderBy(schema.timeEntries.date);
  }

  async weekTotal(organizationId: string, userId: string, weekStart: string): Promise<number> {
    const [r] = await this.db.select({ total: sql<number>`coalesce(sum(${schema.timeEntries.minutes}),0)::int` }).from(schema.timeEntries)
      .where(and(eq(schema.timeEntries.organizationId, organizationId), eq(schema.timeEntries.userId, userId),
        gte(schema.timeEntries.date, weekStart), lte(schema.timeEntries.date, weekEnd(weekStart))));
    return r?.total ?? 0;
  }
}
