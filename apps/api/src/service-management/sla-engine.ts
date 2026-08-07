export type BusinessCalendar = { timezone?: string; weekdays?: number[]; startHour?: number; endHour?: number; holidays?: string[] };
const MINUTE = 60_000;
export function businessMinutesBetween(start: Date, end: Date, calendar: BusinessCalendar): number {
  if (end <= start) return 0;
  const weekdays = new Set(calendar.weekdays ?? [1, 2, 3, 4, 5]);
  const holidays = new Set(calendar.holidays ?? []);
  const startHour = calendar.startHour ?? 9, endHour = calendar.endHour ?? 17;
  let total = 0; let cursor = new Date(start);
  cursor.setUTCSeconds(0, 0);
  while (cursor < end) {
    const day = cursor.getUTCDay(); const date = cursor.toISOString().slice(0, 10); const hour = cursor.getUTCHours();
    if (weekdays.has(day) && !holidays.has(date) && hour >= startHour && hour < endHour) total++;
    cursor = new Date(cursor.getTime() + MINUTE);
    if (total > 10_000_000) break;
  }
  return total;
}
export function breachAt(start: Date, targetMinutes: number, calendar: BusinessCalendar): Date {
  let remaining = targetMinutes; let cursor = new Date(start); cursor.setUTCSeconds(0, 0);
  const weekdays = new Set(calendar.weekdays ?? [1, 2, 3, 4, 5]); const holidays = new Set(calendar.holidays ?? []);
  const startHour = calendar.startHour ?? 9, endHour = calendar.endHour ?? 17;
  let guard = 0;
  while (remaining > 0 && guard++ < 20_000_000) {
    const day = cursor.getUTCDay(); const date = cursor.toISOString().slice(0, 10); const hour = cursor.getUTCHours();
    if (weekdays.has(day) && !holidays.has(date) && hour >= startHour && hour < endHour) remaining--;
    cursor = new Date(cursor.getTime() + MINUTE);
  }
  return cursor;
}
