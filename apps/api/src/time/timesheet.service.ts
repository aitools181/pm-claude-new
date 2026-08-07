import { Injectable, Inject } from "@nestjs/common";
import { and, eq, gte, lte, sql } from "drizzle-orm";
import { schema, type Database } from "@pm/db";
import { AppError } from "@pm/shared";
import { DB } from "../db/db.module.js";
import { mondayOf, weekEnd } from "./week.js";
import { TimeEntriesService } from "./time-entries.service.js";

// allowed transitions
const NEXT: Record<string, string[]> = {
  open: ["submitted"], rejected: ["submitted"],
  submitted: ["approved", "rejected"],
  approved: ["locked", "open"],   // open = reopen
  locked: ["open"],               // reopen
};

@Injectable()
export class TimesheetService {
  constructor(@Inject(DB) private readonly db: Database, private readonly entries: TimeEntriesService) {}

  async getOrCreate(organizationId: string, userId: string, anyDateInWeek: string) {
    const weekStart = mondayOf(anyDateInWeek);
    const [existing] = await this.db.select().from(schema.timesheets)
      .where(and(eq(schema.timesheets.organizationId, organizationId), eq(schema.timesheets.userId, userId), eq(schema.timesheets.weekStart, weekStart))).limit(1);
    if (existing) return existing;
    const [row] = await this.db.insert(schema.timesheets).values({ organizationId, userId, weekStart }).returning();
    return row;
  }

  async summary(organizationId: string, userId: string, anyDateInWeek: string) {
    const weekStart = mondayOf(anyDateInWeek);
    const sheet = await this.getOrCreate(organizationId, userId, weekStart);
    const rows = await this.entries.listWeek(organizationId, userId, weekStart);
    const total = rows.reduce((s, r) => s + r.minutes, 0);
    const byDay: Record<string, number> = {};
    const byProject: Record<string, number> = {};
    for (const r of rows) { byDay[r.date] = (byDay[r.date] ?? 0) + r.minutes; if (r.projectId) byProject[r.projectId] = (byProject[r.projectId] ?? 0) + r.minutes; }
    return { sheet, weekStart, weekEnd: weekEnd(weekStart), totalMinutes: total, entryCount: rows.length, byDay, byProject, entries: rows };
  }

  private async transition(organizationId: string, userId: string, anyDateInWeek: string, to: string, opts: { actorId: string; approver?: boolean; note?: string }) {
    const sheet = await this.getOrCreate(organizationId, userId, anyDateInWeek);
    const allowed = NEXT[sheet.status] ?? [];
    if (!allowed.includes(to)) throw new AppError("CONFLICT", `Cannot move timesheet from ${sheet.status} to ${to}`, { code: "invalid_transition" });

    if (to === "submitted") {
      const total = await this.entries.weekTotal(organizationId, userId, sheet.weekStart);
      if (total <= 0) throw new AppError("VALIDATION", "Cannot submit an empty timesheet");
    }
    const patch: Record<string, unknown> = { status: to };
    if (to === "submitted") { patch.submittedAt = new Date(); patch.decidedByUserId = null; patch.decidedAt = null; patch.note = null; }
    if (to === "approved" || to === "rejected") { patch.decidedByUserId = opts.actorId; patch.decidedAt = new Date(); patch.note = opts.note ?? null; }
    if (to === "open") { patch.submittedAt = null; patch.decidedByUserId = opts.actorId; patch.decidedAt = new Date(); patch.note = opts.note ?? "reopened"; }

    const [row] = await this.db.update(schema.timesheets).set(patch)
      .where(and(eq(schema.timesheets.id, sheet.id), eq(schema.timesheets.status, sheet.status))).returning();
    if (!row) throw new AppError("CONFLICT", "Timesheet changed concurrently");
    return row;
  }

  // owner action
  submit(organizationId: string, userId: string, anyDateInWeek: string) {
    return this.transition(organizationId, userId, anyDateInWeek, "submitted", { actorId: userId });
  }
  // approver actions (targetUserId is the sheet owner)
  approve(organizationId: string, approverId: string, targetUserId: string, anyDateInWeek: string) {
    return this.transition(organizationId, targetUserId, anyDateInWeek, "approved", { actorId: approverId, approver: true });
  }
  reject(organizationId: string, approverId: string, targetUserId: string, anyDateInWeek: string, note: string) {
    return this.transition(organizationId, targetUserId, anyDateInWeek, "rejected", { actorId: approverId, approver: true, note });
  }
  lock(organizationId: string, approverId: string, targetUserId: string, anyDateInWeek: string) {
    return this.transition(organizationId, targetUserId, anyDateInWeek, "locked", { actorId: approverId, approver: true });
  }
  reopen(organizationId: string, approverId: string, targetUserId: string, anyDateInWeek: string, note?: string) {
    return this.transition(organizationId, targetUserId, anyDateInWeek, "open", { actorId: approverId, approver: true, note });
  }

  /** Approval queue: all submitted timesheets in the org. */
  queue(organizationId: string) {
    return this.db.select().from(schema.timesheets)
      .where(and(eq(schema.timesheets.organizationId, organizationId), eq(schema.timesheets.status, "submitted")))
      .orderBy(schema.timesheets.submittedAt);
  }
}
