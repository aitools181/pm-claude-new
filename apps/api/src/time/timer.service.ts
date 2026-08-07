import { Injectable, Inject } from "@nestjs/common";
import { and, eq } from "drizzle-orm";
import { schema, type Database } from "@pm/db";
import { AppError } from "@pm/shared";
import { DB } from "../db/db.module.js";
import { mondayOf, IMMUTABLE_STATUSES } from "./week.js";

@Injectable()
export class TimerService {
  constructor(@Inject(DB) private readonly db: Database) {}

  async current(organizationId: string, userId: string) {
    const [t] = await this.db.select().from(schema.activeTimers)
      .where(and(eq(schema.activeTimers.organizationId, organizationId), eq(schema.activeTimers.userId, userId))).limit(1);
    return t ?? null;
  }

  private minutesSince(startedAt: Date): number {
    return Math.max(1, Math.round((Date.now() - startedAt.getTime()) / 60_000));
  }

  /** Start a timer. If one is already running, stop+log it first (switch). */
  async start(organizationId: string, userId: string, input: { workItemId?: string; projectId?: string; description?: string }) {
    const running = await this.current(organizationId, userId);
    if (running) await this.stop(organizationId, userId);
    const [t] = await this.db.insert(schema.activeTimers)
      .values({ organizationId, userId, workItemId: input.workItemId ?? null, projectId: input.projectId ?? null, description: input.description ?? null })
      .returning();
    return t;
  }

  /** Stop the running timer and commit a time entry. */
  async stop(organizationId: string, userId: string) {
    const running = await this.current(organizationId, userId);
    if (!running) throw new AppError("NOT_FOUND", "No timer is running");
    const date = new Date().toISOString().slice(0, 10);
    // guard: cannot log into a locked/submitted week
    const [ts] = await this.db.select().from(schema.timesheets)
      .where(and(eq(schema.timesheets.organizationId, organizationId), eq(schema.timesheets.userId, userId), eq(schema.timesheets.weekStart, mondayOf(date)))).limit(1);
    if (ts && IMMUTABLE_STATUSES.includes(ts.status)) throw new AppError("CONFLICT", `This week's timesheet is ${ts.status}; cannot log time`);

    const minutes = this.minutesSince(running.startedAt as Date);
    const [entry] = await this.db.transaction(async (tx) => {
      await tx.delete(schema.activeTimers).where(eq(schema.activeTimers.id, running.id));
      return tx.insert(schema.timeEntries).values({
        organizationId, userId, workItemId: running.workItemId, projectId: running.projectId,
        date, minutes, description: running.description, source: "timer",
      }).returning();
    });
    return entry;
  }

  /** Discard the running timer without logging. */
  async discard(organizationId: string, userId: string) {
    const running = await this.current(organizationId, userId);
    if (!running) throw new AppError("NOT_FOUND", "No timer is running");
    await this.db.delete(schema.activeTimers).where(eq(schema.activeTimers.id, running.id));
    return { discarded: true };
  }
}
