import { Injectable, Inject } from "@nestjs/common";
import { and, eq, or, inArray } from "drizzle-orm";
import { schema, type Database } from "@pm/db";
import { AppError } from "@pm/shared";
import { DB } from "../db/db.module.js";
import { canAccessWorkItem } from "../collab/access.js";

@Injectable()
export class DependenciesService {
  constructor(@Inject(DB) private readonly db: Database) {}

  /** Add a dependency, rejecting self-links, duplicates, and anything that forms a cycle. */
  async add(organizationId: string, userId: string, predecessorId: string, successorId: string, type = "finish_to_start") {
    if (predecessorId === successorId) throw new AppError("VALIDATION", "A work item cannot depend on itself");
    if (!(await canAccessWorkItem(this.db, organizationId, predecessorId, userId)) || !(await canAccessWorkItem(this.db, organizationId, successorId, userId)))
      throw new AppError("FORBIDDEN", "No access to one of the items");

    // Cycle check: if the successor can already reach the predecessor, the new edge closes a loop.
    if (await this.reaches(organizationId, successorId, predecessorId)) throw new AppError("VALIDATION", "This dependency would create a circular dependency");

    try {
      const [dep] = await this.db.insert(schema.workItemDependencies).values({ organizationId, predecessorId, successorId, type, createdBy: userId }).returning();
      return dep;
    } catch { throw new AppError("CONFLICT", "That dependency already exists"); }
  }

  async remove(organizationId: string, id: string) {
    await this.db.delete(schema.workItemDependencies).where(and(eq(schema.workItemDependencies.id, id), eq(schema.workItemDependencies.organizationId, organizationId)));
  }

  /** Can `from` reach `to` by following predecessor→successor edges? (BFS, cycle-safe.) */
  private async reaches(organizationId: string, from: string, to: string): Promise<boolean> {
    const seen = new Set<string>();
    let frontier = [from];
    while (frontier.length) {
      const edges = await this.db.select().from(schema.workItemDependencies)
        .where(and(eq(schema.workItemDependencies.organizationId, organizationId), inArray(schema.workItemDependencies.predecessorId, frontier)));
      const next: string[] = [];
      for (const e of edges) {
        if (e.successorId === to) return true;
        if (!seen.has(e.successorId)) { seen.add(e.successorId); next.push(e.successorId); }
      }
      frontier = next;
    }
    return false;
  }

  /** Is an item blocked? (any incomplete predecessor). */
  async isBlocked(organizationId: string, workItemId: string): Promise<boolean> {
    const preds = await this.db.select({ pid: schema.workItemDependencies.predecessorId }).from(schema.workItemDependencies)
      .where(and(eq(schema.workItemDependencies.organizationId, organizationId), eq(schema.workItemDependencies.successorId, workItemId)));
    if (preds.length === 0) return false;
    const rows = await this.db.select().from(schema.workItems).where(inArray(schema.workItems.id, preds.map((p) => p.pid)));
    return rows.some((r) => r.statusCategory !== "done");
  }

  /**
   * Dependency-conflict read model (DISPLAY ONLY — no cascade in V1).
   * finish_to_start: conflict if the successor starts before the predecessor is due.
   */
  async conflicts(organizationId: string, projectId: string) {
    const deps = await this.db.select().from(schema.workItemDependencies).where(eq(schema.workItemDependencies.organizationId, organizationId));
    const ids = [...new Set(deps.flatMap((d) => [d.predecessorId, d.successorId]))];
    if (ids.length === 0) return [];
    const items = new Map((await this.db.select().from(schema.workItems).where(inArray(schema.workItems.id, ids))).map((i) => [i.id, i]));
    const out: any[] = [];
    for (const d of deps) {
      const p = items.get(d.predecessorId), s = items.get(d.successorId);
      if (!p || !s || (p.owningProjectId !== projectId && s.owningProjectId !== projectId)) continue;
      if (d.type === "finish_to_start" && p.dueDate && s.startDate && s.startDate < p.dueDate) {
        out.push({ dependencyId: d.id, predecessorId: p.id, successorId: s.id, kind: "starts_before_predecessor_due", predecessorDue: p.dueDate, successorStart: s.startDate });
      }
    }
    return out;
  }

  /**
   * Dependency graph for a project. Cross-project neighbours the viewer cannot
   * access are returned as REDACTED placeholders — private details never leak.
   */
  async graph(organizationId: string, userId: string, projectId: string) {
    const projItems = await this.db.select().from(schema.workItems).where(and(eq(schema.workItems.organizationId, organizationId), eq(schema.workItems.owningProjectId, projectId)));
    const projIds = new Set(projItems.map((i) => i.id));
    if (projIds.size === 0) return { nodes: [], edges: [] };

    const deps = await this.db.select().from(schema.workItemDependencies)
      .where(and(eq(schema.workItemDependencies.organizationId, organizationId), or(inArray(schema.workItemDependencies.predecessorId, [...projIds]), inArray(schema.workItemDependencies.successorId, [...projIds]))));

    const neighbourIds = [...new Set(deps.flatMap((d) => [d.predecessorId, d.successorId]).filter((id) => !projIds.has(id)))];
    const neighbours = neighbourIds.length ? await this.db.select().from(schema.workItems).where(inArray(schema.workItems.id, neighbourIds)) : [];

    const nodes: any[] = [];
    for (const i of projItems) nodes.push({ id: i.id, key: i.key, title: i.title, statusCategory: i.statusCategory, blocked: await this.isBlocked(organizationId, i.id), external: false, redacted: false });
    for (const n of neighbours) {
      const visible = await canAccessWorkItem(this.db, organizationId, n.id, userId);
      nodes.push(visible
        ? { id: n.id, key: n.key, title: n.title, statusCategory: n.statusCategory, external: true, redacted: false }
        : { id: n.id, key: "—", title: "Restricted item", statusCategory: null, external: true, redacted: true }); // placeholder, no leak
    }
    return { nodes, edges: deps.map((d) => ({ id: d.id, from: d.predecessorId, to: d.successorId, type: d.type })) };
  }

  listForItem(organizationId: string, workItemId: string) {
    return this.db.select().from(schema.workItemDependencies)
      .where(and(eq(schema.workItemDependencies.organizationId, organizationId), or(eq(schema.workItemDependencies.predecessorId, workItemId), eq(schema.workItemDependencies.successorId, workItemId))));
  }
}
