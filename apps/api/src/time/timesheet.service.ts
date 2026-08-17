import { Injectable, Inject } from "@nestjs/common";
import { and, eq, gte, lte, sql, inArray } from "drizzle-orm";
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
      const rows = await this.entries.listWeek(organizationId, userId, sheet.weekStart);
      if (rows.length) {
        await this.db.update(schema.timeEntries).set({ approvalStatus: "pending", rejectionReason: null })
          .where(and(eq(schema.timeEntries.organizationId, organizationId), inArray(schema.timeEntries.id, rows.map((r) => r.id))));
      }
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

  /**
   * TIME.D2 — partial-line approval: an approver acts on individual entries
   * within a submitted timesheet rather than only the whole week. Approved
   * lines lock immediately (TimeEntriesService blocks edits to them even if
   * the sheet later reopens). The overall sheet status is then derived:
   * all lines approved -> sheet approved; any line rejected -> sheet
   * rejected (so the owner sees it needs attention); otherwise it stays
   * submitted while the rest of the review continues.
   */
  async decideLines(organizationId: string, approverId: string, targetUserId: string, anyDateInWeek: string, input: { approveIds?: string[]; rejectIds?: string[]; rejectionReason?: string }) {
    const sheet = await this.getOrCreate(organizationId, targetUserId, anyDateInWeek);
    if (sheet.status !== "submitted") throw new AppError("CONFLICT", "Only a submitted timesheet can have lines decided", { code: "invalid_transition" });
    const approveIds = input.approveIds ?? [];
    const rejectIds = input.rejectIds ?? [];
    if (rejectIds.length && !input.rejectionReason?.trim()) throw new AppError("VALIDATION", "A rejection reason is required for rejected lines");

    if (approveIds.length) await this.db.update(schema.timeEntries).set({ approvalStatus: "approved", rejectionReason: null })
      .where(and(eq(schema.timeEntries.organizationId, organizationId), eq(schema.timeEntries.userId, targetUserId), inArray(schema.timeEntries.id, approveIds)));
    if (rejectIds.length) await this.db.update(schema.timeEntries).set({ approvalStatus: "rejected", rejectionReason: input.rejectionReason?.trim() ?? null })
      .where(and(eq(schema.timeEntries.organizationId, organizationId), eq(schema.timeEntries.userId, targetUserId), inArray(schema.timeEntries.id, rejectIds)));

    const rows = await this.entries.listWeek(organizationId, targetUserId, sheet.weekStart);
    const anyRejected = rows.some((r) => r.approvalStatus === "rejected");
    const allApproved = rows.length > 0 && rows.every((r) => r.approvalStatus === "approved");

    let sheetStatus = sheet.status;
    if (anyRejected) sheetStatus = "rejected";
    else if (allApproved) sheetStatus = "approved";
    if (sheetStatus !== sheet.status) {
      await this.db.update(schema.timesheets).set({ status: sheetStatus, decidedByUserId: approverId, decidedAt: new Date() })
        .where(and(eq(schema.timesheets.id, sheet.id), eq(schema.timesheets.status, sheet.status)));
    }
    return { sheetStatus, approved: approveIds.length, rejected: rejectIds.length, pending: rows.filter((r) => r.approvalStatus === "pending").length };
  }

  /** Approval queue: all submitted timesheets in the org. */
  queue(organizationId: string) {
    return this.db.select().from(schema.timesheets)
      .where(and(eq(schema.timesheets.organizationId, organizationId), eq(schema.timesheets.status, "submitted")))
      .orderBy(schema.timesheets.submittedAt);
  }
}
