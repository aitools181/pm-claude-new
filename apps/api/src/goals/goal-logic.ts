/** Pure goal math — progress, rollup, health. No DB, fully testable. */

export type TargetType = "percent" | "numeric" | "binary" | "rollup";
export type Confidence = "on_track" | "at_risk" | "off_track";

export type GoalCore = { targetType: TargetType; startValue: number | null; targetValue: number | null; currentValue: number | null; confidence: Confidence; status: string };

const clamp = (n: number) => Math.max(0, Math.min(100, n));

/** Progress % for a leaf goal from its own values (no children/links). */
export function leafProgress(g: GoalCore): number {
  const cur = g.currentValue ?? 0;
  switch (g.targetType) {
    case "percent": return clamp(cur);
    case "binary": {
      const target = g.targetValue ?? 1;
      return cur >= target ? 100 : 0;
    }
    case "numeric": {
      const start = g.startValue ?? 0, target = g.targetValue ?? 0;
      if (target === start) return cur >= target ? 100 : 0;
      return clamp(((cur - start) / (target - start)) * 100);
    }
    default: return 0; // rollup handled by caller
  }
}

/** Progress with precedence: rollup(children) > linked-work(done/total) > leaf formula. */
export function computeProgress(g: GoalCore, opts: { childProgress?: number[]; work?: { done: number; total: number } } = {}): number {
  if (g.targetType === "rollup") {
    const cp = opts.childProgress ?? [];
    return cp.length ? Math.round(cp.reduce((s, x) => s + x, 0) / cp.length) : 0;
  }
  if (opts.work && opts.work.total > 0) return Math.round((opts.work.done / opts.work.total) * 100);
  return Math.round(leafProgress(g));
}

/** Expected progress by now, from the elapsed fraction of the goal window. */
export function expectedProgress(createdAt: Date, dueDate: string | null, now: Date = new Date()): number | null {
  if (!dueDate) return null;
  const start = createdAt.getTime(), end = new Date(dueDate + "T23:59:59Z").getTime();
  if (end <= start) return 100;
  return clamp(((now.getTime() - start) / (end - start)) * 100);
}

/** Health blends owner confidence with pace vs the expected line. */
export function health(progress: number, g: GoalCore, expected: number | null): "done" | "on_track" | "at_risk" | "off_track" {
  if (g.status === "closed" || progress >= 100) return "done";
  if (g.confidence === "off_track") return "off_track";
  if (g.confidence === "at_risk") return "at_risk";
  if (expected != null && progress + 10 < expected) return "at_risk"; // behind pace despite stated confidence
  return "on_track";
}
