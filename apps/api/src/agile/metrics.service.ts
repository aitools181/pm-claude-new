import { Injectable, Inject } from "@nestjs/common";
import { and, eq, isNull } from "drizzle-orm";
import { schema, type Database } from "@pm/db";
import { AppError } from "@pm/shared";
import { DB } from "../db/db.module.js";

const pts = (items: { storyPoints: number | null }[]) => items.reduce((s, i) => s + (i.storyPoints ?? 0), 0);

@Injectable()
export class AgileMetricsService {
  constructor(@Inject(DB) private readonly db: Database) {}

  /** Velocity = completed points of the last N closed sprints, plus their average. */
  async velocity(organizationId: string, projectId: string, lastN = 3) {
    const closed = await this.db.select().from(schema.sprints)
      .where(and(eq(schema.sprints.organizationId, organizationId), eq(schema.sprints.projectId, projectId), eq(schema.sprints.state, "closed")))
      .orderBy(schema.sprints.closedAt);
    const reports = [];
    for (const s of closed) {
      const [r] = await this.db.select().from(schema.sprintReports).where(eq(schema.sprintReports.sprintId, s.id)).limit(1);
      if (r) reports.push({ sprintId: s.id, name: s.name, committed: r.committedPoints, completed: r.completedPoints });
    }
    const recent = reports.slice(-lastN);
    const average = recent.length ? Math.round(recent.reduce((s, r) => s + r.completed, 0) / recent.length) : 0;
    return { sprints: reports, average, window: recent.length };
  }

  /** Committed vs completed per closed sprint. */
  async committedVsCompleted(organizationId: string, projectId: string) {
    const v = await this.velocity(organizationId, projectId, 999);
    return v.sprints.map((s) => ({ name: s.name, committed: s.committed, completed: s.completed, delta: s.completed - s.committed }));
  }

  /** Burndown: frozen report for closed sprints; a live 2-point series for active ones. */
  async burndown(organizationId: string, sprintId: string) {
    const [sprint] = await this.db.select().from(schema.sprints).where(and(eq(schema.sprints.id, sprintId), eq(schema.sprints.organizationId, organizationId))).limit(1);
    if (!sprint) throw new AppError("NOT_FOUND", "Sprint not found");
    if (sprint.state === "closed") {
      const [r] = await this.db.select().from(schema.sprintReports).where(eq(schema.sprintReports.sprintId, sprintId)).limit(1);
      return { frozen: true, burndown: r?.burndown ?? [], report: r };
    }
    const items = await this.db.select().from(schema.workItems).where(and(eq(schema.workItems.organizationId, organizationId), eq(schema.workItems.sprintId, sprintId), isNull(schema.workItems.deletedAt)));
    const committed = sprint.committedPoints ?? pts(items);
    const done = pts(items.filter((i) => i.statusCategory === "done"));
    return { frozen: false, committedPoints: committed, completedPoints: done, remainingPoints: Math.max(0, committed - done) };
  }

  /** Cycle time (in_progress → done) and lead time (created → done), averaged over done items. */
  async cycleLeadTime(organizationId: string, projectId: string) {
    const done = await this.db.select().from(schema.workItems)
      .where(and(eq(schema.workItems.organizationId, organizationId), eq(schema.workItems.owningProjectId, projectId), eq(schema.workItems.statusCategory, "done")));
    if (!done.length) return { items: [], avgCycleHours: 0, avgLeadHours: 0 };
    const hist = await this.db.select().from(schema.workItemStatusHistory)
      .where(and(eq(schema.workItemStatusHistory.organizationId, organizationId), eq(schema.workItemStatusHistory.projectId, projectId)))
      .orderBy(schema.workItemStatusHistory.at);
    const H = (ms: number) => Math.round((ms / 3_600_000) * 10) / 10;
    const rows: { id: string; key: string; cycleHours: number | null; leadHours: number | null }[] = [];
    let cycleSum = 0, cycleN = 0, leadSum = 0, leadN = 0;
    for (const it of done) {
      const h = hist.filter((x) => x.workItemId === it.id);
      const doneAt = h.find((x) => x.toCategory === "done")?.at as Date | undefined;
      const inProg = h.find((x) => x.toCategory === "in_progress")?.at as Date | undefined;
      const created = it.createdAt as unknown as Date;
      const lead = doneAt ? H(new Date(doneAt).getTime() - new Date(created).getTime()) : null;
      const cycle = doneAt && inProg ? H(new Date(doneAt).getTime() - new Date(inProg).getTime()) : null;
      if (lead != null) { leadSum += lead; leadN++; }
      if (cycle != null) { cycleSum += cycle; cycleN++; }
      rows.push({ id: it.id, key: it.key, cycleHours: cycle, leadHours: lead });
    }
    return { items: rows, avgCycleHours: cycleN ? Math.round((cycleSum / cycleN) * 10) / 10 : 0, avgLeadHours: leadN ? Math.round((leadSum / leadN) * 10) / 10 : 0 };
  }

  /** Burnup: cumulative completed points vs the (growing) scope line, by completion date. */
  async burnup(organizationId: string, sprintId: string) {
    const [sprint] = await this.db.select().from(schema.sprints).where(and(eq(schema.sprints.id, sprintId), eq(schema.sprints.organizationId, organizationId))).limit(1);
    if (!sprint) throw new AppError("NOT_FOUND", "Sprint not found");
    const scope = sprint.committedPoints ?? 0;
    const added = await this.db.select().from(schema.sprintScopeEvents).where(and(eq(schema.sprintScopeEvents.sprintId, sprintId), eq(schema.sprintScopeEvents.type, "added")));
    const totalScope = scope + added.reduce((s, e) => s + (e.points ?? 0), 0);
    const items = await this.db.select().from(schema.workItems).where(and(eq(schema.workItems.organizationId, organizationId), eq(schema.workItems.sprintId, sprintId)));
    const completed = pts(items.filter((i) => i.statusCategory === "done"));
    return { totalScope, completed, series: [{ label: "start", scope, completed: 0 }, { label: "now", scope: totalScope, completed }] };
  }

  /** Cumulative flow: per-day item counts by category, reconstructed from status history. */
  async cfd(organizationId: string, projectId: string, from: string, to: string) {
    const items = await this.db.select({ id: schema.workItems.id, createdAt: schema.workItems.createdAt }).from(schema.workItems)
      .where(and(eq(schema.workItems.organizationId, organizationId), eq(schema.workItems.owningProjectId, projectId)));
    const hist = await this.db.select().from(schema.workItemStatusHistory)
      .where(and(eq(schema.workItemStatusHistory.organizationId, organizationId), eq(schema.workItemStatusHistory.projectId, projectId)))
      .orderBy(schema.workItemStatusHistory.at);
    const days: string[] = []; { const d = new Date(from + "T00:00:00Z"); const end = new Date(to + "T00:00:00Z"); while (d <= end) { days.push(d.toISOString().slice(0, 10)); d.setUTCDate(d.getUTCDate() + 1); } }
    return days.map((day) => {
      const cutoff = new Date(day + "T23:59:59Z").getTime();
      const counts: Record<string, number> = { todo: 0, in_progress: 0, done: 0 };
      for (const it of items) {
        if (new Date(it.createdAt as unknown as Date).getTime() > cutoff) continue;
        const transitions = hist.filter((h) => h.workItemId === it.id && new Date(h.at as unknown as Date).getTime() <= cutoff);
        const cat = transitions.length ? transitions[transitions.length - 1].toCategory : "todo";
        counts[cat] = (counts[cat] ?? 0) + 1;
      }
      return { date: day, ...counts };
    });
  }
}
