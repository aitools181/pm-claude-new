import { Injectable, Inject } from "@nestjs/common";
import { and, eq } from "drizzle-orm";
import { schema, type Database } from "@pm/db";
import { AppError } from "@pm/shared";
import { DB } from "../db/db.module.js";

/* ---- pure, timezone-safe (all-day, UTC-anchored) working-day math ---- */
const toUTC = (s: string) => new Date(s + "T00:00:00Z");
const fmt = (d: Date) => d.toISOString().slice(0, 10);

export function isWorkingDay(dateStr: string, workingDays: number[], holidays: Set<string>): boolean {
  return workingDays.includes(toUTC(dateStr).getUTCDay()) && !holidays.has(dateStr);
}
export function workingDaysBetween(startStr: string, endStr: string, workingDays: number[], holidays: Set<string>): number {
  let count = 0; const end = toUTC(endStr);
  for (let d = toUTC(startStr); d <= end; d.setUTCDate(d.getUTCDate() + 1)) if (isWorkingDay(fmt(d), workingDays, holidays)) count++;
  return count;
}
export function subtractWorkingDays(startStr: string, n: number, workingDays: number[], holidays: Set<string>): string {
  const d = toUTC(startStr); let done = 0;
  while (done < n) { d.setUTCDate(d.getUTCDate() - 1); if (isWorkingDay(fmt(d), workingDays, holidays)) done++; }
  return fmt(d);
}
export function snapToWorkingDay(dateStr: string, workingDays: number[], holidays: Set<string>): string {
  return isWorkingDay(dateStr, workingDays, holidays) ? dateStr : addWorkingDays(dateStr, 1, workingDays, holidays);
}
export function addWorkingDays(startStr: string, n: number, workingDays: number[], holidays: Set<string>): string {
  const d = toUTC(startStr); let added = 0;
  while (added < n) { d.setUTCDate(d.getUTCDate() + 1); if (isWorkingDay(fmt(d), workingDays, holidays)) added++; }
  return fmt(d);
}

@Injectable()
export class CalendarService {
  constructor(@Inject(DB) private readonly db: Database) {}

  async createCalendar(organizationId: string, userId: string, input: { name: string; workingDays?: number[]; timezone?: string; isDefault?: boolean }) {
    const [c] = await this.db.insert(schema.workingCalendars).values({ organizationId, name: input.name, workingDays: input.workingDays ?? [1, 2, 3, 4, 5], timezone: input.timezone ?? "UTC", isDefault: input.isDefault ?? false, createdBy: userId }).returning();
    return c;
  }
  addHoliday(organizationId: string, calendarId: string, date: string, name: string) {
    return this.db.insert(schema.holidays).values({ organizationId, calendarId, date, name }).onConflictDoNothing();
  }
  list(organizationId: string) { return this.db.select().from(schema.workingCalendars).where(eq(schema.workingCalendars.organizationId, organizationId)); }

  private async load(organizationId: string, calendarId: string) {
    const [cal] = await this.db.select().from(schema.workingCalendars).where(and(eq(schema.workingCalendars.id, calendarId), eq(schema.workingCalendars.organizationId, organizationId))).limit(1);
    if (!cal) throw new AppError("NOT_FOUND", "Calendar not found");
    const hol = await this.db.select().from(schema.holidays).where(eq(schema.holidays.calendarId, calendarId));
    return { workingDays: cal.workingDays as number[], holidays: new Set(hol.map((h) => h.date)) };
  }

  async workingDaysBetween(organizationId: string, calendarId: string, start: string, end: string) {
    const { workingDays, holidays } = await this.load(organizationId, calendarId);
    return workingDaysBetween(start, end, workingDays, holidays);
  }
  async addWorkingDays(organizationId: string, calendarId: string, start: string, n: number) {
    const { workingDays, holidays } = await this.load(organizationId, calendarId);
    return addWorkingDays(start, n, workingDays, holidays);
  }
}
