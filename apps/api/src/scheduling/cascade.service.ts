import { Injectable, Inject } from "@nestjs/common";
import { and, eq, inArray } from "drizzle-orm";
import { schema, type Database } from "@pm/db";
import { AppError } from "@pm/shared";
import { DB } from "../db/db.module.js";
import { SchedulingService } from "./scheduling.service.js";
import { addWorkingDays, snapToWorkingDay } from "../calendar/calendar.service.js";
import { canAccessWorkItem } from "../collab/access.js";

export type CascadeRow = {
  itemId: string; key: string; title: string;
  oldStart: string | null; oldDue: string | null;
  newStart: string; newDue: string;
  changed: boolean; manualConflict: boolean; redacted: boolean;
};

@Injectable()
export class CascadeService {
  constructor(@Inject(DB) private readonly db: Database, private readonly sched: SchedulingService) {}

  /** Compute the downstream cascade of moving `triggerId` to `newStart`. Pure of persistence. */
  private async computeCascade(organizationId: string, userId: string, triggerId: string, newStart: string) {
    const ctx = await this.sched.loadContext(organizationId, triggerId ? await this.projectOf(organizationId, triggerId) : "");
    const byId = new Map(ctx.items.map((i) => [i.id, i]));
    const trigger = byId.get(triggerId);
    if (!trigger) throw new AppError("NOT_FOUND", "Work item not found");
    const { wd, hol } = ctx;

    const preds = new Map<string, string[]>(), succs = new Map<string, string[]>();
    ctx.items.forEach((i) => { preds.set(i.id, []); succs.set(i.id, []); });
    for (const d of ctx.deps) { preds.get(d.successorId)!.push(d.predecessorId); succs.get(d.predecessorId)!.push(d.successorId); }

    // topological order
    const indeg = new Map(ctx.items.map((i) => [i.id, preds.get(i.id)!.length]));
    let q = ctx.items.filter((i) => indeg.get(i.id) === 0).map((i) => i.id); const order: string[] = [];
    while (q.length) { const u = q.shift()!; order.push(u); for (const v of succs.get(u)!) { indeg.set(v, indeg.get(v)! - 1); if (indeg.get(v) === 0) q.push(v); } }

    const curStart = (id: string) => byId.get(id)!.startDate;
    const dur = (id: string) => Math.max(1, this.sched.duration(byId.get(id)!, wd, hol));
    const effES = new Map<string, string>(), effEF = new Map<string, string>();
    const rows: CascadeRow[] = [];

    // seed current effective schedule from stored dates
    for (const i of ctx.items) {
      const s = i.startDate ? snapToWorkingDay(i.startDate, wd, hol) : null;
      if (s) { effES.set(i.id, s); effEF.set(i.id, addWorkingDays(s, dur(i.id) - 1, wd, hol)); }
    }
    // move trigger
    const ts = snapToWorkingDay(newStart, wd, hol);
    effES.set(triggerId, ts); effEF.set(triggerId, addWorkingDays(ts, dur(triggerId) - 1, wd, hol));

    for (const id of order) {
      const it = byId.get(id)!;
      const ps = preds.get(id)!;
      let required: string | null = null;
      for (const p of ps) { const pef = effEF.get(p); if (pef) { const c = addWorkingDays(pef, 1, wd, hol); if (!required || c > required) required = c; } }
      if (id === triggerId) continue; // trigger already fixed
      if (!required) continue;        // no scheduled predecessor influence
      const old = curStart(id);
      const oldEff = effES.get(id);
      if (it.scheduleMode === "auto") {
        if (oldEff !== required) {
          effES.set(id, required); effEF.set(id, addWorkingDays(required, dur(id) - 1, wd, hol));
        }
      } else {
        // manual: do not move; flag a conflict if it now starts too early
        if (old && old < required) rows.push(await this.row(organizationId, userId, it, old, required, true));
      }
    }

    // build change rows (trigger + moved auto items)
    for (const id of order) {
      const it = byId.get(id)!;
      const ns = effES.get(id); if (!ns) continue;
      const nd = effEF.get(id)!;
      const changed = id === triggerId || (it.startDate !== ns);
      if (!changed) continue;
      if (rows.find((r) => r.itemId === id)) continue;
      rows.push(await this.row(organizationId, userId, it, ns, nd, false, nd));
    }
    return { rows, effES, effEF, byId };
  }

  private async row(org: string, userId: string, it: { id: string; key: string; title: string; startDate: string | null; dueDate: string | null }, newStart: string, requiredOrNewDue: string, manualConflict: boolean, newDue?: string): Promise<CascadeRow> {
    const visible = await canAccessWorkItem(this.db, org, it.id, userId);
    return {
      itemId: it.id, key: visible ? it.key : "—", title: visible ? it.title : "Restricted item",
      oldStart: it.startDate, oldDue: it.dueDate,
      newStart: manualConflict ? it.startDate ?? newStart : newStart,
      newDue: manualConflict ? it.dueDate ?? requiredOrNewDue : (newDue ?? requiredOrNewDue),
      changed: !manualConflict, manualConflict, redacted: !visible,
    };
  }

  private async projectOf(organizationId: string, itemId: string): Promise<string> {
    const [i] = await this.db.select({ p: schema.workItems.owningProjectId }).from(schema.workItems)
      .where(and(eq(schema.workItems.id, itemId), eq(schema.workItems.organizationId, organizationId))).limit(1);
    if (!i) throw new AppError("NOT_FOUND", "Work item not found");
    return i.p;
  }

  /** PREVIEW — nothing is written. */
  async preview(organizationId: string, userId: string, triggerId: string, newStart: string) {
    const { rows } = await this.computeCascade(organizationId, userId, triggerId, newStart);
    return { changes: rows, changedCount: rows.filter((r) => r.changed).length, conflicts: rows.filter((r) => r.manualConflict).length };
  }

  /** CONFIRM — apply the cascade in one transaction and journal a reversible operation. */
  async confirm(organizationId: string, userId: string, triggerId: string, newStart: string) {
    const { rows, byId } = await this.computeCascade(organizationId, userId, triggerId, newStart);
    const applied = rows.filter((r) => r.changed && !r.redacted);
    if (applied.length === 0) return { operationId: null, applied: 0 };
    const before = applied.map((r) => { const it = byId.get(r.itemId)!; return { itemId: r.itemId, startDate: it.startDate, dueDate: it.dueDate }; });
    const after = applied.map((r) => ({ itemId: r.itemId, startDate: r.newStart, dueDate: r.newDue }));

    const projectId = await this.projectOf(organizationId, triggerId);
    const [op] = await this.db.transaction(async (tx) => {
      for (const a of after) await tx.update(schema.workItems).set({ startDate: a.startDate, dueDate: a.dueDate }).where(and(eq(schema.workItems.id, a.itemId), eq(schema.workItems.organizationId, organizationId)));
      return tx.insert(schema.rescheduleOperations).values({ organizationId, projectId, triggerItemId: triggerId, actorUserId: userId, before, after }).returning();
    });
    return { operationId: op.id, applied: applied.length };
  }

  /** UNDO — restore the pre-cascade dates. */
  async undo(organizationId: string, operationId: string) {
    const [op] = await this.db.select().from(schema.rescheduleOperations)
      .where(and(eq(schema.rescheduleOperations.id, operationId), eq(schema.rescheduleOperations.organizationId, organizationId))).limit(1);
    if (!op) throw new AppError("NOT_FOUND", "Reschedule operation not found");
    if (op.undone) throw new AppError("CONFLICT", "Already undone");
    const before = op.before as { itemId: string; startDate: string | null; dueDate: string | null }[];
    await this.db.transaction(async (tx) => {
      for (const b of before) await tx.update(schema.workItems).set({ startDate: b.startDate, dueDate: b.dueDate }).where(and(eq(schema.workItems.id, b.itemId), eq(schema.workItems.organizationId, organizationId)));
      await tx.update(schema.rescheduleOperations).set({ undone: true }).where(eq(schema.rescheduleOperations.id, operationId));
    });
    return { restored: before.length };
  }
}
