import { Injectable, Inject } from "@nestjs/common";
import { and, eq, isNull } from "drizzle-orm";
import { schema, type Database } from "@pm/db";
import { DB } from "../db/db.module.js";
import { addWorkingDays, subtractWorkingDays, snapToWorkingDay, workingDaysBetween } from "../calendar/calendar.service.js";

export type ItemSchedule = { es: string; ef: string; ls: string; lf: string; slack: number; critical: boolean };
type Ctx = {
  items: { id: string; key: string; title: string; parentId: string | null; startDate: string | null; dueDate: string | null; durationDays: number | null; scheduleMode: string }[];
  deps: { predecessorId: string; successorId: string; type: string }[];
  wd: number[]; hol: Set<string>;
};

@Injectable()
export class SchedulingService {
  constructor(@Inject(DB) private readonly db: Database) {}

  async loadContext(organizationId: string, projectId: string): Promise<Ctx> {
    const items = await this.db.select().from(schema.workItems)
      .where(and(eq(schema.workItems.organizationId, organizationId), eq(schema.workItems.owningProjectId, projectId), isNull(schema.workItems.deletedAt)));
    const ids = new Set(items.map((i) => i.id));
    const alldeps = await this.db.select().from(schema.workItemDependencies).where(eq(schema.workItemDependencies.organizationId, organizationId));
    const deps = alldeps.filter((d) => ids.has(d.predecessorId) && ids.has(d.successorId));
    const [cal] = await this.db.select().from(schema.workingCalendars)
      .where(and(eq(schema.workingCalendars.organizationId, organizationId), eq(schema.workingCalendars.isDefault, true))).limit(1);
    let wd = [1, 2, 3, 4, 5]; let hol = new Set<string>();
    if (cal) { wd = cal.workingDays as number[]; const hs = await this.db.select().from(schema.holidays).where(eq(schema.holidays.calendarId, cal.id)); hol = new Set(hs.map((h) => h.date)); }
    return { items: items.map((i) => ({ id: i.id, key: i.key, title: i.title, parentId: i.parentId, startDate: i.startDate, dueDate: i.dueDate, durationDays: i.durationDays, scheduleMode: i.scheduleMode })), deps, wd, hol };
  }

  duration(i: Ctx["items"][number], wd: number[], hol: Set<string>): number {
    if (i.durationDays && i.durationDays > 0) return i.durationDays;
    if (i.startDate && i.dueDate && i.startDate <= i.dueDate) return workingDaysBetween(i.startDate, i.dueDate, wd, hol);
    return 1;
  }

  /** Critical Path Method: forward + backward pass over the finish-to-start network. */
  compute(ctx: Ctx): { schedule: Record<string, ItemSchedule>; criticalPath: string[]; projectStart: string | null; projectEnd: string | null } {
    const { items, deps, wd, hol } = ctx;
    if (items.length === 0) return { schedule: {}, criticalPath: [], projectStart: null, projectEnd: null };
    const byId = new Map(items.map((i) => [i.id, i]));
    const preds = new Map<string, string[]>(), succs = new Map<string, string[]>();
    items.forEach((i) => { preds.set(i.id, []); succs.set(i.id, []); });
    for (const d of deps) { preds.get(d.successorId)!.push(d.predecessorId); succs.get(d.predecessorId)!.push(d.successorId); }

    const projectStart = snapToWorkingDay(items.map((i) => i.startDate).filter(Boolean).sort()[0] ?? new Date().toISOString().slice(0, 10), wd, hol);

    // topological order (Kahn)
    const indeg = new Map(items.map((i) => [i.id, preds.get(i.id)!.length]));
    let q = items.filter((i) => indeg.get(i.id) === 0).map((i) => i.id); const order: string[] = [];
    let guard = 0;
    while (q.length && guard++ < 100000) { const u = q.shift()!; order.push(u); for (const v of succs.get(u)!) { indeg.set(v, indeg.get(v)! - 1); if (indeg.get(v) === 0) q.push(v); } }

    // forward pass
    const es = new Map<string, string>(), ef = new Map<string, string>();
    for (const id of order) {
      const it = byId.get(id)!; const ps = preds.get(id)!;
      let start: string;
      if (ps.length === 0) start = snapToWorkingDay(it.startDate ?? projectStart, wd, hol);
      else { let latest = projectStart; for (const p of ps) { const c = addWorkingDays(ef.get(p)!, 1, wd, hol); if (c > latest) latest = c; } start = latest; }
      const d = Math.max(1, this.duration(it, wd, hol));
      es.set(id, start); ef.set(id, addWorkingDays(start, d - 1, wd, hol));
    }
    const projectEnd = [...ef.values()].sort().slice(-1)[0] ?? null;

    // backward pass
    const lf = new Map<string, string>(), ls = new Map<string, string>();
    for (const id of [...order].reverse()) {
      const it = byId.get(id)!; const ss = succs.get(id)!;
      let finish: string;
      if (ss.length === 0) finish = projectEnd!;
      else { let earliest = projectEnd!; for (const s of ss) { const c = subtractWorkingDays(ls.get(s)!, 1, wd, hol); if (c < earliest) earliest = c; } finish = earliest; }
      const d = Math.max(1, this.duration(it, wd, hol));
      lf.set(id, finish); ls.set(id, subtractWorkingDays(finish, d - 1, wd, hol));
    }

    const schedule: Record<string, ItemSchedule> = {}; const cp: string[] = [];
    for (const id of order) {
      const slack = workingDaysBetween(es.get(id)!, ls.get(id)!, wd, hol) - 1;
      const critical = slack <= 0;
      schedule[id] = { es: es.get(id)!, ef: ef.get(id)!, ls: ls.get(id)!, lf: lf.get(id)!, slack: Math.max(0, slack), critical };
      if (critical) cp.push(id);
    }
    return { schedule, criticalPath: cp, projectStart, projectEnd };
  }

  async computeForProject(organizationId: string, projectId: string) {
    const ctx = await this.loadContext(organizationId, projectId);
    const res = this.compute(ctx);
    return { ...res, items: ctx.items.map((i) => ({ id: i.id, key: i.key, title: i.title, parentId: i.parentId, scheduleMode: i.scheduleMode, ...res.schedule[i.id] })) };
  }

  /** Gantt hierarchy rollup: a parent spans min(child start) .. max(child finish). */
  async hierarchyRollup(organizationId: string, projectId: string) {
    const ctx = await this.loadContext(organizationId, projectId);
    const { schedule } = this.compute(ctx);
    const children = new Map<string, string[]>();
    for (const i of ctx.items) if (i.parentId) { children.set(i.parentId, [...(children.get(i.parentId) ?? []), i.id]); }
    const memo = new Map<string, { start: string; end: string }>();
    const roll = (id: string): { start: string; end: string } => {
      if (memo.has(id)) return memo.get(id)!;
      const kids = children.get(id) ?? [];
      let span = { start: schedule[id]?.es, end: schedule[id]?.ef } as { start: string; end: string };
      for (const k of kids) { const c = roll(k); if (!span.start || c.start < span.start) span.start = c.start; if (!span.end || c.end > span.end) span.end = c.end; }
      memo.set(id, span); return span;
    };
    return ctx.items.map((i) => { const s = roll(i.id); return { id: i.id, key: i.key, title: i.title, parentId: i.parentId, isParent: (children.get(i.id) ?? []).length > 0, start: s.start ?? null, end: s.end ?? null, critical: schedule[i.id]?.critical ?? false, slack: schedule[i.id]?.slack ?? 0 }; });
  }
}
