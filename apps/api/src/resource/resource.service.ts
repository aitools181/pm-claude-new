import { Injectable, Inject } from "@nestjs/common";
import { and, eq, gte, lte, isNull, inArray } from "drizzle-orm";
import { schema, type Database } from "@pm/db";
import { AppError } from "@pm/shared";
import { DB } from "../db/db.module.js";
import { isWorkingDay } from "../calendar/calendar.service.js";
import { computeCapacity, type AllocationInput } from "./capacity-core.js";

type Cal = { wd: number[]; hol: Set<string> };

@Injectable()
export class ResourceService {
  constructor(@Inject(DB) private readonly db: Database) {}

  // ---- calendar ----
  private async calendar(organizationId: string): Promise<Cal> {
    const [cal] = await this.db.select().from(schema.workingCalendars)
      .where(and(eq(schema.workingCalendars.organizationId, organizationId), eq(schema.workingCalendars.isDefault, true))).limit(1);
    if (!cal) return { wd: [1, 2, 3, 4, 5], hol: new Set() };
    const hs = await this.db.select().from(schema.holidays).where(eq(schema.holidays.calendarId, cal.id));
    return { wd: cal.workingDays as number[], hol: new Set(hs.map((h) => h.date)) };
  }
  private eachDay(from: string, to: string): string[] {
    const out: string[] = []; const d = new Date(from + "T00:00:00Z"); const end = new Date(to + "T00:00:00Z");
    while (d <= end) { out.push(d.toISOString().slice(0, 10)); d.setUTCDate(d.getUTCDate() + 1); }
    return out;
  }
  private countWorkingDays(days: string[], wd: number[], hol: Set<string>) {
    let working = 0, holiday = 0;
    for (const day of days) {
      const dow = new Date(day + "T00:00:00Z").getUTCDay();
      const isWd = wd.includes(dow === 0 ? 7 : dow);
      if (isWd && hol.has(day)) holiday++;
      else if (isWd) working++;
    }
    return { working, holiday };
  }

  // ---- profile ----
  async getProfile(organizationId: string, userId: string) {
    const [p] = await this.db.select().from(schema.capacityProfiles)
      .where(and(eq(schema.capacityProfiles.organizationId, organizationId), eq(schema.capacityProfiles.userId, userId))).limit(1);
    return p ?? { userId, hoursPerDay: 8, workingDays: null };
  }
  async setProfile(organizationId: string, userId: string, input: { hoursPerDay: number; workingDays?: number[] | null }) {
    const existing = await this.db.select().from(schema.capacityProfiles)
      .where(and(eq(schema.capacityProfiles.organizationId, organizationId), eq(schema.capacityProfiles.userId, userId))).limit(1);
    if (existing.length) {
      const [row] = await this.db.update(schema.capacityProfiles).set({ hoursPerDay: input.hoursPerDay, workingDays: input.workingDays ?? null })
        .where(eq(schema.capacityProfiles.id, existing[0].id)).returning();
      return row;
    }
    const [row] = await this.db.insert(schema.capacityProfiles).values({ organizationId, userId, hoursPerDay: input.hoursPerDay, workingDays: input.workingDays ?? null }).returning();
    return row;
  }

  // ---- leave ----
  createLeave(organizationId: string, userId: string, input: { startDate: string; endDate: string; type?: string; note?: string }) {
    if (input.endDate < input.startDate) throw new AppError("VALIDATION", "endDate before startDate");
    return this.db.insert(schema.leaves).values({ organizationId, userId, startDate: input.startDate, endDate: input.endDate, type: input.type ?? "vacation", note: input.note ?? null })
      .returning().then((r) => r[0]);
  }
  listLeave(organizationId: string, userId: string) {
    return this.db.select().from(schema.leaves).where(and(eq(schema.leaves.organizationId, organizationId), eq(schema.leaves.userId, userId))).orderBy(schema.leaves.startDate);
  }
  async setLeaveStatus(organizationId: string, id: string, status: string) {
    const [row] = await this.db.update(schema.leaves).set({ status })
      .where(and(eq(schema.leaves.id, id), eq(schema.leaves.organizationId, organizationId))).returning();
    if (!row) throw new AppError("NOT_FOUND", "Leave not found");
    return row;
  }

  // ---- allocation ----
  createAllocation(organizationId: string, input: { userId: string; projectId: string; startDate: string; endDate: string; percent?: number; note?: string }) {
    if (input.endDate < input.startDate) throw new AppError("VALIDATION", "endDate before startDate");
    const percent = input.percent ?? 100;
    if (percent < 0 || percent > 100) throw new AppError("VALIDATION", "percent must be 0..100");
    return this.db.insert(schema.allocations).values({ organizationId, userId: input.userId, projectId: input.projectId, startDate: input.startDate, endDate: input.endDate, percent, note: input.note ?? null })
      .returning().then((r) => r[0]);
  }
  listAllocations(organizationId: string, userId: string) {
    return this.db.select().from(schema.allocations).where(and(eq(schema.allocations.organizationId, organizationId), eq(schema.allocations.userId, userId))).orderBy(schema.allocations.startDate);
  }
  async deleteAllocation(organizationId: string, id: string) {
    await this.db.delete(schema.allocations).where(and(eq(schema.allocations.id, id), eq(schema.allocations.organizationId, organizationId)));
    return { deleted: true };
  }

  // ---- workload ----
  private overlapWorkingDays(aFrom: string, aTo: string, from: string, to: string, wd: number[], hol: Set<string>) {
    const s = aFrom > from ? aFrom : from, e = aTo < to ? aTo : to;
    if (e < s) return 0;
    return this.countWorkingDays(this.eachDay(s, e), wd, hol).working;
  }

  async workload(organizationId: string, userId: string, from: string, to: string) {
    const cal = await this.calendar(organizationId);
    const profile = await this.getProfile(organizationId, userId);
    const wd = (profile.workingDays as number[] | null) ?? cal.wd;
    const days = this.eachDay(from, to);
    const { working, holiday } = this.countWorkingDays(days, wd, cal.hol);

    // leave working days in range
    const leaves = await this.db.select().from(schema.leaves)
      .where(and(eq(schema.leaves.organizationId, organizationId), eq(schema.leaves.userId, userId), eq(schema.leaves.status, "approved")));
    let leaveDays = 0;
    for (const lv of leaves) leaveDays += this.overlapWorkingDays(lv.startDate, lv.endDate, from, to, wd, cal.hol);

    // allocations overlapping range
    const allocs = await this.db.select().from(schema.allocations)
      .where(and(eq(schema.allocations.organizationId, organizationId), eq(schema.allocations.userId, userId)));
    const allocInputs: AllocationInput[] = allocs
      .map((a) => ({ percent: a.percent, workingDays: this.overlapWorkingDays(a.startDate, a.endDate, from, to, wd, cal.hol) }))
      .filter((a) => a.workingDays > 0);

    // assigned work items in range: estimated vs unestimated (separate)
    const assigned = await this.db.select({ estimate: schema.workItems.estimateMinutes, start: schema.workItems.startDate, due: schema.workItems.dueDate })
      .from(schema.workItemAssignees)
      .innerJoin(schema.workItems, eq(schema.workItemAssignees.workItemId, schema.workItems.id))
      .where(and(eq(schema.workItemAssignees.organizationId, organizationId), eq(schema.workItemAssignees.userId, userId), isNull(schema.workItems.deletedAt)));
    let estimatedWorkMin = 0, unestimatedItems = 0;
    for (const it of assigned) {
      const s = it.start ?? from, e = it.due ?? it.start ?? to;
      if (e < from || s > to) continue; // outside range
      if (it.estimate != null) estimatedWorkMin += it.estimate; else unestimatedItems++;
    }

    const breakdown = computeCapacity({ workingDays: working, holidayDays: holiday, hoursPerDay: profile.hoursPerDay, leaveDays, allocations: allocInputs, estimatedWorkMin, unestimatedItems });
    return { userId, from, to, ...breakdown };
  }

  /** Team workload over a range for every org member. */
  async team(organizationId: string, from: string, to: string) {
    const members = await this.db.select({ userId: schema.organizationMemberships.userId }).from(schema.organizationMemberships)
      .where(eq(schema.organizationMemberships.organizationId, organizationId));
    return Promise.all(members.map((m) => this.workload(organizationId, m.userId, from, to)));
  }
}
