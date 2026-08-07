import { Injectable, Inject } from "@nestjs/common";
import { and, eq, isNull } from "drizzle-orm";
import { schema, type Database } from "@pm/db";
import { AppError } from "@pm/shared";
import { DB } from "../db/db.module.js";
import { canAccessWorkItem } from "../collab/access.js";
import { leafProgress } from "../goals/goal-logic.js";
import { METRIC_CATALOGUE, catalogueEntry } from "./metric-catalogue.js";

const DEFAULT_TTL = 300; // seconds

@Injectable()
export class MetricService {
  constructor(@Inject(DB) private readonly db: Database) {}

  catalogue() { return METRIC_CATALOGUE; }

  // ---- definitions ----
  createDefinition(organizationId: string, input: { key: string; name: string; source: string; params?: Record<string, unknown>; unit?: string }) {
    if (!catalogueEntry(input.source)) throw new AppError("VALIDATION", "Unknown metric source");
    return this.db.insert(schema.metricDefinitions).values({ organizationId, key: input.key, name: input.name, source: input.source, params: input.params ?? {}, unit: input.unit ?? catalogueEntry(input.source)!.unit }).returning().then((r) => r[0]);
  }
  listDefinitions(organizationId: string) {
    return this.db.select().from(schema.metricDefinitions).where(eq(schema.metricDefinitions.organizationId, organizationId));
  }

  /** The visible formula = catalogue formula + the definition's params. */
  formula(source: string, params: Record<string, unknown>) {
    const e = catalogueEntry(source);
    return { source, label: e?.label ?? source, formula: e?.formula ?? "", unit: e?.unit ?? "", params };
  }

  // ---- computation ----
  async compute(organizationId: string, source: string, params: Record<string, any>): Promise<{ value: number; unit: string }> {
    const e = catalogueEntry(source);
    if (!e) throw new AppError("VALIDATION", "Unknown metric source");
    switch (source) {
      case "work.done_ratio": {
        const its = await this.scopedItems(organizationId, params.projectId);
        const total = its.length, done = its.filter((i) => i.statusCategory === "done").length;
        return { value: total ? Math.round((done / total) * 100) : 0, unit: "%" };
      }
      case "work.open_count": {
        const its = await this.scopedItems(organizationId, params.projectId);
        return { value: its.filter((i) => i.statusCategory !== "done").length, unit: "items" };
      }
      case "goal.avg_progress": {
        const goals = await this.db.select().from(schema.goals).where(and(eq(schema.goals.organizationId, organizationId), eq(schema.goals.status, "active")));
        if (!goals.length) return { value: 0, unit: "%" };
        const avg = goals.reduce((s, g) => s + leafProgress({ targetType: g.targetType as any, startValue: g.startValue, targetValue: g.targetValue, currentValue: g.currentValue, confidence: "on_track", status: g.status }), 0) / goals.length;
        return { value: Math.round(avg), unit: "%" };
      }
      default: return { value: 0, unit: e.unit };
    }
  }

  private scopedItems(organizationId: string, projectId?: string) {
    const conds = [eq(schema.workItems.organizationId, organizationId), isNull(schema.workItems.deletedAt)];
    if (projectId) conds.push(eq(schema.workItems.owningProjectId, projectId));
    return this.db.select({ id: schema.workItems.id, statusCategory: schema.workItems.statusCategory }).from(schema.workItems).where(and(...conds));
  }

  /** Cached snapshot with a freshness flag. Recomputes if missing, stale, or forced. */
  async snapshot(organizationId: string, definitionId: string, opts: { force?: boolean; ttlSeconds?: number } = {}) {
    const [def] = await this.db.select().from(schema.metricDefinitions).where(and(eq(schema.metricDefinitions.id, definitionId), eq(schema.metricDefinitions.organizationId, organizationId))).limit(1);
    if (!def) throw new AppError("NOT_FOUND", "Metric definition not found");
    const ttl = opts.ttlSeconds ?? DEFAULT_TTL;
    const [existing] = await this.db.select().from(schema.metricSnapshots).where(eq(schema.metricSnapshots.definitionId, definitionId)).limit(1);
    const ageOf = (t: Date) => Math.floor((Date.now() - new Date(t).getTime()) / 1000);

    if (existing && !opts.force && ageOf(existing.computedAt as Date) < ttl) {
      return { value: existing.value, unit: existing.unit, computedAt: existing.computedAt, ageSeconds: ageOf(existing.computedAt as Date), stale: false, cached: true, formula: this.formula(def.source, def.params as any) };
    }
    const { value, unit } = await this.compute(organizationId, def.source, def.params as any);
    const now = new Date();
    if (existing) await this.db.update(schema.metricSnapshots).set({ value, unit, computedAt: now }).where(eq(schema.metricSnapshots.id, existing.id));
    else await this.db.insert(schema.metricSnapshots).values({ organizationId, definitionId, value, unit, computedAt: now });
    return { value, unit, computedAt: now, ageSeconds: 0, stale: false, cached: false, formula: this.formula(def.source, def.params as any) };
  }

  /** Drill-down: return only records the viewer is authorised to see. */
  async drill(organizationId: string, userId: string, source: string, params: Record<string, any>) {
    if (source !== "work.open_count") return { records: [], drillable: false };
    const its = await this.db.select({ id: schema.workItems.id, key: schema.workItems.key, title: schema.workItems.title, statusCategory: schema.workItems.statusCategory })
      .from(schema.workItems).where(and(...[eq(schema.workItems.organizationId, organizationId), isNull(schema.workItems.deletedAt), ...(params.projectId ? [eq(schema.workItems.owningProjectId, params.projectId)] : [])]));
    const open = its.filter((i) => i.statusCategory !== "done");
    const authorized = [];
    for (const it of open) if (await canAccessWorkItem(this.db, organizationId, it.id, userId)) authorized.push({ id: it.id, key: it.key, title: it.title });
    return { records: authorized, drillable: true, total: open.length, authorizedCount: authorized.length };
  }
}
