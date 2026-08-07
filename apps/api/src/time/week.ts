/** ISO Monday (UTC) for the week containing dateStr (YYYY-MM-DD). */
export function mondayOf(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00Z");
  const dow = d.getUTCDay();               // 0=Sun..6=Sat
  const delta = dow === 0 ? -6 : 1 - dow;  // back to Monday
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}
export function weekEnd(weekStart: string): string {
  const d = new Date(weekStart + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + 6);
  return d.toISOString().slice(0, 10);
}
export const IMMUTABLE_STATUSES = ["submitted", "approved", "locked"];
