import { Injectable, Inject } from "@nestjs/common";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { schema, type Database } from "@pm/db";
import { AppError } from "@pm/shared";
import { DB } from "../db/db.module.js";
import { canAccessProject } from "../collab/access.js";

const today = () => new Date().toISOString().slice(0, 10);

@Injectable()
export class PortfolioService {
  constructor(@Inject(DB) private readonly db: Database) {}

  create(organizationId: string, userId: string, input: { name: string; description?: string }) {
    return this.db.insert(schema.portfolios).values({ organizationId, name: input.name, description: input.description ?? null, ownerUserId: userId }).returning().then((r) => r[0]);
  }
  list(organizationId: string) {
    return this.db.select().from(schema.portfolios).where(eq(schema.portfolios.organizationId, organizationId)).orderBy(schema.portfolios.createdAt);
  }
  private async load(organizationId: string, id: string) {
    const [p] = await this.db.select().from(schema.portfolios).where(and(eq(schema.portfolios.id, id), eq(schema.portfolios.organizationId, organizationId))).limit(1);
    if (!p) throw new AppError("NOT_FOUND", "Portfolio not found");
    return p;
  }

  async addProject(organizationId: string, portfolioId: string, projectId: string) {
    await this.load(organizationId, portfolioId);
    await this.db.insert(schema.portfolioProjects).values({ organizationId, portfolioId, projectId });
    return { added: true };
  }
  async removeProject(organizationId: string, portfolioId: string, projectId: string) {
    await this.db.delete(schema.portfolioProjects).where(and(eq(schema.portfolioProjects.portfolioId, portfolioId), eq(schema.portfolioProjects.projectId, projectId), eq(schema.portfolioProjects.organizationId, organizationId)));
    return { removed: true };
  }

  // ---- initiatives ----
  createInitiative(organizationId: string, portfolioId: string, input: { name: string; description?: string; leadUserId?: string; targetDate?: string }) {
    return this.db.insert(schema.initiatives).values({ organizationId, portfolioId, name: input.name, description: input.description ?? null, leadUserId: input.leadUserId ?? null, targetDate: input.targetDate ?? null }).returning().then((r) => r[0]);
  }
  listInitiatives(organizationId: string, portfolioId: string) {
    return this.db.select().from(schema.initiatives).where(and(eq(schema.initiatives.organizationId, organizationId), eq(schema.initiatives.portfolioId, portfolioId))).orderBy(schema.initiatives.createdAt);
  }
  async setInitiativeStatus(organizationId: string, id: string, status: string) {
    const [row] = await this.db.update(schema.initiatives).set({ status }).where(and(eq(schema.initiatives.id, id), eq(schema.initiatives.organizationId, organizationId))).returning();
    if (!row) throw new AppError("NOT_FOUND", "Initiative not found");
    return row;
  }

  // ---- milestones ----
  createMilestone(organizationId: string, portfolioId: string, input: { name: string; dueDate?: string; initiativeId?: string }) {
    return this.db.insert(schema.milestones).values({ organizationId, portfolioId, initiativeId: input.initiativeId ?? null, name: input.name, dueDate: input.dueDate ?? null }).returning().then((r) => r[0]);
  }
  listMilestones(organizationId: string, portfolioId: string) {
    return this.db.select().from(schema.milestones).where(and(eq(schema.milestones.organizationId, organizationId), eq(schema.milestones.portfolioId, portfolioId))).orderBy(schema.milestones.dueDate);
  }
  async setMilestoneStatus(organizationId: string, id: string, status: string) {
    const [row] = await this.db.update(schema.milestones).set({ status, completedAt: status === "hit" ? new Date() : null })
      .where(and(eq(schema.milestones.id, id), eq(schema.milestones.organizationId, organizationId))).returning();
    if (!row) throw new AppError("NOT_FOUND", "Milestone not found");
    return row;
  }

  private async projectStats(projectId: string) {
    const its = await this.db.select({ c: schema.workItems.statusCategory, s: schema.workItems.startDate, d: schema.workItems.dueDate }).from(schema.workItems)
      .where(and(eq(schema.workItems.owningProjectId, projectId), isNull(schema.workItems.deletedAt)));
    const total = its.length, done = its.filter((i) => i.c === "done").length;
    const starts = its.map((i) => i.s).filter(Boolean) as string[]; const dues = its.map((i) => i.d).filter(Boolean) as string[];
    return { total, done, progress: total ? Math.round((done / total) * 100) : 0, start: starts.sort()[0] ?? null, end: dues.sort().slice(-1)[0] ?? null };
  }

  /** Executive rollup. Projects the viewer can't access are redacted — name AND metrics hidden. */
  async rollup(organizationId: string, userId: string, portfolioId: string) {
    const portfolio = await this.load(organizationId, portfolioId);
    const links = await this.db.select().from(schema.portfolioProjects).where(and(eq(schema.portfolioProjects.organizationId, organizationId), eq(schema.portfolioProjects.portfolioId, portfolioId)));
    const rows = [];
    let aggDone = 0, aggTotal = 0;
    for (const l of links) {
      const visible = await canAccessProject(this.db, organizationId, l.projectId, userId);
      if (!visible) { rows.push({ projectId: null, name: "Restricted", redacted: true, progress: null, done: null, total: null, start: null, end: null }); continue; }
      const [proj] = await this.db.select({ name: schema.projects.name }).from(schema.projects).where(eq(schema.projects.id, l.projectId)).limit(1);
      const st = await this.projectStats(l.projectId);
      aggDone += st.done; aggTotal += st.total;
      rows.push({ projectId: l.projectId, name: proj?.name ?? "", redacted: false, ...st });
    }
    const milestones = await this.listMilestones(organizationId, portfolioId);
    const t = today();
    const msSummary = { total: milestones.length, hit: milestones.filter((m) => m.status === "hit").length, missed: milestones.filter((m) => m.status === "missed").length, overdue: milestones.filter((m) => m.status === "planned" && m.dueDate && m.dueDate < t).length };
    return { portfolio: { id: portfolio.id, name: portfolio.name }, projects: rows, aggregateProgress: aggTotal ? Math.round((aggDone / aggTotal) * 100) : 0, aggregateDone: aggDone, aggregateTotal: aggTotal, milestones: msSummary };
  }

  /** Timeline data for the executive view: project date spans + milestones (redacted-safe). */
  async timeline(organizationId: string, userId: string, portfolioId: string) {
    const roll = await this.rollup(organizationId, userId, portfolioId);
    const milestones = (await this.listMilestones(organizationId, portfolioId)).map((m) => ({ id: m.id, name: m.name, dueDate: m.dueDate, status: m.status }));
    return { bars: roll.projects.filter((p) => !p.redacted).map((p) => ({ name: p.name, start: p.start, end: p.end, progress: p.progress })), milestones };
  }
}
