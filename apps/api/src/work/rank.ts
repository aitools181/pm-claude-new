/** Minimal fractional-index rank. Enough for MVP ordering; refine later if needed. */
export function rankBetween(before: string | null, after: string | null): string {
  if (!before && !after) return "n";
  if (!before) return after! > "a" ? String.fromCharCode(after!.charCodeAt(0) - 1) : "a" + after;
  if (!after) return before + "n";
  const mid = before + "m";
  return mid < after ? mid : before + "g";
}
