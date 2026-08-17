import { Injectable, Inject } from "@nestjs/common";
import { ne, count, asc, and, eq, gte, lte, isNull, inArray } from "drizzle-orm";
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
  /** The capacity profile in effect on a given date (default: today). Falls back to the always-on default (8h/day, calendar working days) if nothing covers it. */
  async getProfile(organizationId: string, userId: string, atDate?: string) {
    const at = atDate ?? new Date().toISOString().slice(0, 10);
    const rows = await this.db.select().from(schema.capacityProfiles)
      .where(and(eq(schema.capacityProfiles.organizationId, organizationId), eq(schema.capacityProfiles.userId, userId)));
    const covering = rows.find((p) => (!p.effectiveFrom || p.effectiveFrom <= at) && (!p.effectiveTo || p.effectiveTo >= at));
    return covering ?? { userId, hoursPerDay: 8, workingDays: null, effectiveFrom: null, effectiveTo: null };
  }

  /** All profile periods for a user, oldest first — the effective-dated history. */
  async profileHistory(organizationId: string, userId: string) {
    return this.db.select().from(schema.capacityProfiles)
      .where(and(eq(schema.capacityProfiles.organizationId, organizationId), eq(schema.capacityProfiles.userId, userId)))
      .orderBy(asc(schema.capacityProfiles.effectiveFrom));
  }

  /**
   * CAP.D1 — add a new capacity period starting on effectiveFrom (open-ended
   * if no effectiveTo). If an existing open-ended period would otherwise
   * overlap the new one, it's automatically closed the day before the new
   * period starts ("supersede" semantics) rather than requiring the caller
   * to manage overlaps manually.
   */
  async addProfilePeriod(organizationId: string, userId: string, input: { hoursPerDay: number; workingDays?: number[] | null; effectiveFrom?: string | null; effectiveTo?: string | null }) {
    if (input.effectiveFrom && input.effectiveTo && input.effectiveTo < input.effectiveFrom) throw new AppError("VALIDATION", "effectiveTo must be on or after effectiveFrom");
    if (input.effectiveFrom) {
      const openEnded = await this.db.select().from(schema.capacityProfiles)
        .where(and(eq(schema.capacityProfiles.organizationId, organizationId), eq(schema.capacityProfiles.userId, userId), isNull(schema.capacityProfiles.effectiveTo)));
      for (const p of openEnded) {
        if (!p.effectiveFrom || p.effectiveFrom < input.effectiveFrom) {
          const dayBefore = new Date(`${input.effectiveFrom}T00:00:00Z`); dayBefore.setUTCDate(dayBefore.getUTCDate() - 1);
          await this.db.update(schema.capacityProfiles).set({ effectiveTo: dayBefore.toISOString().slice(0, 10) }).where(eq(schema.capacityProfiles.id, p.id));
        }
      }
    } else {
      // No dates given = the new "always in effect, unless later superseded"
      // default. Replace any prior default row rather than creating a second,
      // ambiguous one — dated periods (past or future) are left untouched.
      await this.db.delete(schema.capacityProfiles).where(and(
        eq(schema.capacityProfiles.organizationId, organizationId), eq(schema.capacityProfiles.userId, userId),
        isNull(schema.capacityProfiles.effectiveFrom), isNull(schema.capacityProfiles.effectiveTo),
      ));
    }
    const [row] = await this.db.insert(schema.capacityProfiles).values({
      organizationId, userId, hoursPerDay: input.hoursPerDay, workingDays: input.workingDays ?? null,
      effectiveFrom: input.effectiveFrom ?? null, effectiveTo: input.effectiveTo ?? null,
    }).returning();
    return row;
  }

  async removeProfilePeriod(organizationId: string, userId: string, id: string) {
    await this.db.delete(schema.capacityProfiles).where(and(eq(schema.capacityProfiles.id, id), eq(schema.capacityProfiles.organizationId, organizationId), eq(schema.capacityProfiles.userId, userId)));
    return { ok: true };
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

    // CAP.D1 — split [from, to] into segments wherever the effective capacity
    // profile changes, so a mid-range hours/working-days change is reflected
    // accurately rather than averaged or applied to the whole range.
    const profiles = await this.profileHistory(organizationId, userId);
    const boundaries = new Set<string>([from]);
    for (const p of profiles) {
      if (p.effectiveFrom && p.effectiveFrom > from && p.effectiveFrom <= to) boundaries.add(p.effectiveFrom);
      if (p.effectiveTo) {
        const next = new Date(`${p.effectiveTo}T00:00:00Z`); next.setUTCDate(next.getUTCDate() + 1);
        const nextStr = next.toISOString().slice(0, 10);
        if (nextStr > from && nextStr <= to) boundaries.add(nextStr);
      }
    }
    const points = [...boundaries].sort();
    const segments: { start: string; end: string }[] = points.map((start, i) => {
      const nextStart = points[i + 1];
      let end = to;
      if (nextStart) { const d = new Date(`${nextStart}T00:00:00Z`); d.setUTCDate(d.getUTCDate() - 1); end = d.toISOString().slice(0, 10); }
      return { start, end };
    }).filter((s) => s.start <= s.end);

    const leaves = await this.db.select().from(schema.leaves)
      .where(and(eq(schema.leaves.organizationId, organizationId), eq(schema.leaves.userId, userId), eq(schema.leaves.status, "approved")));
    const allocs = await this.db.select().from(schema.allocations)
      .where(and(eq(schema.allocations.organizationId, organizationId), eq(schema.allocations.userId, userId)));
    const assigned = await this.db.select({ estimate: schema.workItems.estimateMinutes, start: schema.workItems.startDate, due: schema.workItems.dueDate })
      .from(schema.workItemAssignees)
      .innerJoin(schema.workItems, eq(schema.workItemAssignees.workItemId, schema.workItems.id))
      .where(and(eq(schema.workItemAssignees.organizationId, organizationId), eq(schema.workItemAssignees.userId, userId), isNull(schema.workItems.deletedAt)));

    const breakdowns: (ReturnType<typeof computeCapacity> & { from: string; to: string; hoursPerDay: number })[] = [];
    for (const seg of segments) {
      const profile = await this.getProfile(organizationId, userId, seg.start);
      const wd = (profile.workingDays as number[] | null) ?? cal.wd;
      const days = this.eachDay(seg.start, seg.end);
      const { working, holiday } = this.countWorkingDays(days, wd, cal.hol);

      let leaveDays = 0;
      for (const lv of leaves) leaveDays += this.overlapWorkingDays(lv.startDate, lv.endDate, seg.start, seg.end, wd, cal.hol);

      const allocInputs: AllocationInput[] = allocs
        .map((a) => ({ percent: a.percent, workingDays: this.overlapWorkingDays(a.startDate, a.endDate, seg.start, seg.end, wd, cal.hol) }))
        .filter((a) => a.workingDays > 0);

      let estimatedWorkMin = 0, unestimatedItems = 0;
      for (const it of assigned) {
        const s = it.start ?? seg.start, e = it.due ?? it.start ?? seg.end;
        if (e < seg.start || s > seg.end) continue;
        if (it.estimate != null) estimatedWorkMin += it.estimate; else unestimatedItems++;
      }
      breakdowns.push({ ...computeCapacity({ workingDays: working, holidayDays: holiday, hoursPerDay: profile.hoursPerDay, leaveDays, allocations: allocInputs, estimatedWorkMin, unestimatedItems }), from: seg.start, to: seg.end, hoursPerDay: profile.hoursPerDay });
    }

    // Aggregate across segments; per-segment breakdown kept for transparency
    // when the profile actually changed mid-range.
    const sum = (key: keyof (typeof breakdowns)[number]) => breakdowns.reduce((s, b) => s + (Number(b[key]) || 0), 0);
    const netCapacityMin = sum("netCapacityMin");
    const allocatedMin = sum("allocatedMin");
    return {
      userId, from, to,
      workingDays: sum("workingDays"), holidayDays: sum("holidayDays"),
      grossCapacityMin: sum("grossCapacityMin"), leaveDays: sum("leaveDays"), leaveMin: sum("leaveMin"), netCapacityMin,
      allocatedMin, estimatedWorkMin: sum("estimatedWorkMin"), unestimatedItems: sum("unestimatedItems"),
      utilizationPct: netCapacityMin > 0 ? Math.round((allocatedMin / netCapacityMin) * 100) : 0,
      overAllocated: allocatedMin > netCapacityMin,
      segments: breakdowns.length > 1 ? breakdowns : undefined, // only surfaced when the profile actually changed mid-range
    };
  }

  /** Team workload over a range for every org member. */
  async team(organizationId: string, from: string, to: string) {
    const members = await this.db.select({ userId: schema.organizationMemberships.userId }).from(schema.organizationMemberships)
      .where(eq(schema.organizationMemberships.organizationId, organizationId));
    return Promise.all(members.map((m) => this.workload(organizationId, m.userId, from, to)));
  }


  // ---- F16 skills registry ----

  async mySkills(org: string, userId: string) {
    return this.db.select({ skill: schema.userSkills.skill, level: schema.userSkills.level }).from(schema.userSkills)
      .where(and(eq(schema.userSkills.organizationId, org), eq(schema.userSkills.userId, userId), isNull(schema.userSkills.deletedAt)))
      .orderBy(asc(schema.userSkills.skill));
  }

  /** Replace a user's skill set atomically (self-service or RESOURCE_MANAGE). */
  async setSkills(org: string, actorId: string, targetUserId: string, skills: { skill: string; level: number }[]) {
    const clean = new Map<string, number>();
    for (const s of skills) {
      const name = s.skill.trim().toLowerCase();
      if (name) clean.set(name, Math.min(5, Math.max(1, Math.round(s.level))));
    }
    return this.db.transaction(async (tx) => {
      await tx.update(schema.userSkills).set({ deletedAt: new Date(), deletedBy: actorId })
        .where(and(eq(schema.userSkills.organizationId, org), eq(schema.userSkills.userId, targetUserId), isNull(schema.userSkills.deletedAt)));
      for (const [skill, level] of clean) {
        await tx.insert(schema.userSkills).values({ organizationId: org, userId: targetUserId, skill, level, createdBy: actorId })
          .onConflictDoUpdate({ target: [schema.userSkills.organizationId, schema.userSkills.userId, schema.userSkills.skill], set: { level, deletedAt: null, deletedBy: null, updatedAt: new Date(), updatedBy: actorId } });
      }
      return { ok: true, skills: clean.size };
    });
  }

  /** Org-wide matrix: every member with their skills, for the People admin. */
  async skillsMatrix(org: string) {
    const rows = await this.db.select({ userId: schema.userSkills.userId, displayName: schema.users.displayName, skill: schema.userSkills.skill, level: schema.userSkills.level })
      .from(schema.userSkills).innerJoin(schema.users, eq(schema.users.id, schema.userSkills.userId))
      .where(and(eq(schema.userSkills.organizationId, org), isNull(schema.userSkills.deletedAt)))
      .orderBy(asc(schema.users.displayName), asc(schema.userSkills.skill));
    const byUser = new Map<string, { userId: string; displayName: string; skills: { skill: string; level: number }[] }>();
    for (const r of rows) {
      const entry = byUser.get(r.userId) ?? { userId: r.userId, displayName: r.displayName, skills: [] };
      entry.skills.push({ skill: r.skill, level: r.level });
      byUser.set(r.userId, entry);
    }
    return [...byUser.values()];
  }

  /** Skill-aware assignment suggestion: members with the skill, best level first,
   *  least open work first — the two blueprint signals for F16 suggestions. */
  async suggestAssignees(org: string, skill: string, limit = 8) {
    const wanted = skill.trim().toLowerCase();
    const skilled = await this.db.select({ userId: schema.userSkills.userId, displayName: schema.users.displayName, level: schema.userSkills.level })
      .from(schema.userSkills).innerJoin(schema.users, eq(schema.users.id, schema.userSkills.userId))
      .where(and(eq(schema.userSkills.organizationId, org), eq(schema.userSkills.skill, wanted), isNull(schema.userSkills.deletedAt)));
    if (!skilled.length) return [];
    const ids = skilled.map((s) => s.userId);
    const open = await this.db.select({ ownerId: schema.workItems.primaryOwnerUserId, n: count() }).from(schema.workItems)
      .where(and(eq(schema.workItems.organizationId, org), inArray(schema.workItems.primaryOwnerUserId, ids), ne(schema.workItems.statusCategory, "done"), isNull(schema.workItems.deletedAt)))
      .groupBy(schema.workItems.primaryOwnerUserId);
    const load = new Map(open.map((o) => [o.ownerId, Number(o.n)]));
    return skilled
      .map((s) => ({ ...s, openItems: load.get(s.userId) ?? 0 }))
      .sort((a, b) => b.level - a.level || a.openItems - b.openItems)
      .slice(0, limit);
  }

}
