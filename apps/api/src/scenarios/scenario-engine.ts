export type ScenarioItem = { id: string; startDate: string | null; dueDate: string | null; durationDays: number | null; estimateMinutes: number | null; ownerId: string | null; version: number; progress: number; statusCategory: string };
export type ScenarioDependency = { predecessorId: string; successorId: string };
export type ScheduleOutput = { items: ScenarioItem[]; warnings: Array<{ workItemId?: string; code: string; severity: string; message: string }>; explanation: string[] };

const DAY = 86_400_000;
const day = (v: string | null, fallback: Date) => v ? new Date(`${v}T00:00:00Z`) : fallback;
const iso = (d: Date) => d.toISOString().slice(0, 10);

export function autoSchedule(items: ScenarioItem[], dependencies: ScenarioDependency[], anchorDate = new Date()): ScheduleOutput {
  const result = new Map(items.map((i) => [i.id, { ...i }]));
  const incoming = new Map<string, string[]>();
  for (const d of dependencies) incoming.set(d.successorId, [...(incoming.get(d.successorId) ?? []), d.predecessorId]);
  const warnings: ScheduleOutput["warnings"] = [];
  const explanation: string[] = [];
  const unresolved = new Set(items.map((i) => i.id));
  for (let pass = 0; pass < items.length + 1 && unresolved.size; pass++) {
    let moved = 0;
    for (const id of [...unresolved]) {
      const item = result.get(id)!;
      const predecessors = incoming.get(id) ?? [];
      if (predecessors.some((p) => unresolved.has(p))) continue;
      const predecessorDue = predecessors.map((p) => result.get(p)?.dueDate).filter(Boolean).map((v) => new Date(`${v}T00:00:00Z`).getTime());
      const earliest = predecessorDue.length ? new Date(Math.max(...predecessorDue) + DAY) : anchorDate;
      const start = day(item.startDate, earliest) < earliest ? earliest : day(item.startDate, earliest);
      const duration = Math.max(1, item.durationDays ?? Math.ceil((item.estimateMinutes ?? 480) / 480));
      const due = new Date(start.getTime() + (duration - 1) * DAY);
      item.startDate = iso(start); item.dueDate = iso(due); result.set(id, item);
      explanation.push(`${id}: ${item.startDate} -> ${item.dueDate} (${duration} work days)`);
      unresolved.delete(id); moved++;
      if (!item.estimateMinutes && !item.durationDays) warnings.push({ workItemId: id, code: "UNESTIMATED_WORK", severity: "warning", message: "A default one-day duration was used because no estimate was available." });
    }
    if (!moved) break;
  }
  for (const id of unresolved) warnings.push({ workItemId: id, code: "DEPENDENCY_CYCLE", severity: "error", message: "This item is part of a dependency cycle and could not be scheduled." });
  const ownerLoad = new Map<string, number>();
  for (const item of result.values()) if (item.ownerId) ownerLoad.set(item.ownerId, (ownerLoad.get(item.ownerId) ?? 0) + Math.max(1, item.durationDays ?? 1));
  for (const [ownerId, load] of ownerLoad) if (load > 40) warnings.push({ code: "OWNER_OVERLOAD", severity: "warning", message: `Owner ${ownerId} has ${load} planned work days in this scenario.` });
  return { items: [...result.values()], warnings, explanation };
}
