import { Injectable, Inject } from "@nestjs/common";
import { and, eq } from "drizzle-orm";
import { schema, type Database } from "@pm/db";
import { AppError } from "@pm/shared";
import { DB } from "../db/db.module.js";
import { MetricService } from "./metric.service.js";

type Widget = { id: string; type: string; title: string; source?: string; params?: Record<string, unknown>; definitionId?: string };

@Injectable()
export class DashboardService {
  constructor(@Inject(DB) private readonly db: Database, private readonly metrics: MetricService) {}

  create(organizationId: string, userId: string, input: { name: string; visibility?: "private" | "org"; widgets?: Widget[] }) {
    return this.db.insert(schema.dashboards).values({ organizationId, name: input.name, ownerUserId: userId, visibility: input.visibility ?? "org", widgets: input.widgets ?? [] }).returning().then((r) => r[0]);
  }
  list(organizationId: string, userId: string) {
    return this.db.select().from(schema.dashboards).where(eq(schema.dashboards.organizationId, organizationId))
      .then((rows) => rows.filter((d) => d.visibility === "org" || d.ownerUserId === userId));
  }
  private async load(organizationId: string, userId: string, id: string) {
    const [d] = await this.db.select().from(schema.dashboards).where(and(eq(schema.dashboards.id, id), eq(schema.dashboards.organizationId, organizationId))).limit(1);
    if (!d) throw new AppError("NOT_FOUND", "Dashboard not found");
    if (d.visibility === "private" && d.ownerUserId !== userId) throw new AppError("FORBIDDEN", "Private dashboard");
    return d;
  }

  async update(organizationId: string, userId: string, id: string, patch: Partial<{ name: string; visibility: string; widgets: Widget[] }>) {
    await this.load(organizationId, userId, id);
    const [row] = await this.db.update(schema.dashboards).set(patch).where(eq(schema.dashboards.id, id)).returning();
    return row;
  }

  /** Render each widget with its computed value, unit, visible formula and freshness. */
  async render(organizationId: string, userId: string, id: string) {
    const d = await this.load(organizationId, userId, id);
    const widgets = (d.widgets as Widget[]) ?? [];
    const rendered = [];
    for (const w of widgets) {
      try {
        if (w.definitionId) {
          const snap = await this.metrics.snapshot(organizationId, w.definitionId, {});
          rendered.push({ ...w, value: snap.value, unit: snap.unit, formula: snap.formula, computedAt: snap.computedAt, ageSeconds: snap.ageSeconds, stale: snap.stale, cached: snap.cached });
        } else if (w.source) {
          const { value, unit } = await this.metrics.compute(organizationId, w.source, (w.params ?? {}) as any);
          rendered.push({ ...w, value, unit, formula: this.metrics.formula(w.source, (w.params ?? {}) as any), computedAt: new Date(), ageSeconds: 0, stale: false, cached: false });
        } else rendered.push({ ...w, value: null, error: "no source" });
      } catch (e) { rendered.push({ ...w, value: null, error: e instanceof AppError ? e.message : "compute failed" }); }
    }
    return { dashboard: { id: d.id, name: d.name, visibility: d.visibility }, widgets: rendered };
  }

  /** Drill a widget to its underlying authorised records. */
  async drill(organizationId: string, userId: string, id: string, widgetId: string) {
    const d = await this.load(organizationId, userId, id);
    const w = ((d.widgets as Widget[]) ?? []).find((x) => x.id === widgetId);
    if (!w || !w.source) throw new AppError("NOT_FOUND", "Widget not found");
    return this.metrics.drill(organizationId, userId, w.source, (w.params ?? {}) as any);
  }
}
