import { Injectable, Inject } from "@nestjs/common";
import { and, eq, isNull } from "drizzle-orm";
import { schema, type Database } from "@pm/db";
import { AppError } from "@pm/shared";
import { DB } from "../db/db.module.js";
import { MetricService } from "./metric.service.js";
import { issueToken, sha256 } from "../common/crypto.js";

type Widget = { id: string; type: string; title: string; source?: string; params?: Record<string, unknown>; definitionId?: string };

@Injectable()
export class DashboardService {
  constructor(@Inject(DB) private readonly db: Database, private readonly metrics: MetricService) {}

  create(organizationId: string, userId: string, input: { name: string; visibility?: "private" | "team" | "project" | "org"; scopeId?: string; widgets?: Widget[] }) {
    if ((input.visibility === "team" || input.visibility === "project") && !input.scopeId) throw new AppError("VALIDATION", "A team or project dashboard requires scopeId");
    return this.db.insert(schema.dashboards).values({ organizationId, name: input.name, ownerUserId: userId, visibility: input.visibility ?? "org", scopeId: input.scopeId ?? null, widgets: input.widgets ?? [] }).returning().then((r) => r[0]);
  }
  async list(organizationId: string, userId: string) {
    const rows = await this.db.select().from(schema.dashboards).where(eq(schema.dashboards.organizationId, organizationId));
    const myTeamIds = (await this.db.select({ teamId: schema.teamMembers.teamId }).from(schema.teamMembers)
      .where(and(eq(schema.teamMembers.organizationId, organizationId), eq(schema.teamMembers.userId, userId), isNull(schema.teamMembers.deletedAt)))).map((r) => r.teamId);
    const myProjectIds = (await this.db.select({ projectId: schema.projectMembers.projectId }).from(schema.projectMembers)
      .where(and(eq(schema.projectMembers.organizationId, organizationId), eq(schema.projectMembers.userId, userId), isNull(schema.projectMembers.deletedAt)))).map((r) => r.projectId);
    return rows.filter((d) =>
      d.visibility === "org" || d.ownerUserId === userId ||
      (d.visibility === "team" && d.scopeId && myTeamIds.includes(d.scopeId)) ||
      (d.visibility === "project" && d.scopeId && myProjectIds.includes(d.scopeId)));
  }
  private async load(organizationId: string, userId: string, id: string) {
    const [d] = await this.db.select().from(schema.dashboards).where(and(eq(schema.dashboards.id, id), eq(schema.dashboards.organizationId, organizationId))).limit(1);
    if (!d) throw new AppError("NOT_FOUND", "Dashboard not found");
    if (d.visibility === "private" && d.ownerUserId !== userId) throw new AppError("FORBIDDEN", "Private dashboard");
    if (d.visibility === "team" && d.ownerUserId !== userId) {
      const [m] = await this.db.select({ id: schema.teamMembers.id }).from(schema.teamMembers)
        .where(and(eq(schema.teamMembers.organizationId, organizationId), eq(schema.teamMembers.userId, userId), eq(schema.teamMembers.teamId, d.scopeId!), isNull(schema.teamMembers.deletedAt))).limit(1);
      if (!m) throw new AppError("FORBIDDEN", "Team dashboard");
    }
    if (d.visibility === "project" && d.ownerUserId !== userId) {
      const [m] = await this.db.select({ id: schema.projectMembers.id }).from(schema.projectMembers)
        .where(and(eq(schema.projectMembers.organizationId, organizationId), eq(schema.projectMembers.userId, userId), eq(schema.projectMembers.projectId, d.scopeId!), isNull(schema.projectMembers.deletedAt))).limit(1);
      if (!m) throw new AppError("FORBIDDEN", "Project dashboard");
    }
    return d;
  }

  async update(organizationId: string, userId: string, id: string, patch: Partial<{ name: string; visibility: string; widgets: Widget[] }>) {
    await this.load(organizationId, userId, id);
    const [row] = await this.db.update(schema.dashboards).set(patch).where(eq(schema.dashboards.id, id)).returning();
    return row;
  }

  // ---- F21 external share links (explicit widget allow-list; least-data by design) ----

  async createShare(organizationId: string, userId: string, dashboardId: string, input: { widgetIds: string[]; expiresInDays?: number | null }) {
    const dashboard = await this.load(organizationId, userId, dashboardId);
    const validIds = new Set(((dashboard.widgets as Widget[]) ?? []).map((w) => w.id));
    const widgetIds = input.widgetIds.filter((id) => validIds.has(id));
    if (!widgetIds.length) throw new AppError("VALIDATION", "Select at least one widget that exists on this dashboard to share");
    const token = issueToken(24);
    const [row] = await this.db.insert(schema.dashboardShares).values({
      organizationId, dashboardId, tokenHash: token.hash, widgetIds,
      expiresAt: input.expiresInDays ? new Date(Date.now() + input.expiresInDays * 86_400_000) : null,
      createdByUserId: userId,
    }).returning();
    return { ...row, token: token.raw }; // raw token returned once, at creation — never again
  }

  listShares(organizationId: string, dashboardId: string) {
    return this.db.select({ id: schema.dashboardShares.id, widgetIds: schema.dashboardShares.widgetIds, active: schema.dashboardShares.active, expiresAt: schema.dashboardShares.expiresAt, viewCount: schema.dashboardShares.viewCount, createdAt: schema.dashboardShares.createdAt })
      .from(schema.dashboardShares).where(and(eq(schema.dashboardShares.organizationId, organizationId), eq(schema.dashboardShares.dashboardId, dashboardId)));
  }

  async revokeShare(organizationId: string, shareId: string) {
    await this.db.update(schema.dashboardShares).set({ active: false }).where(and(eq(schema.dashboardShares.id, shareId), eq(schema.dashboardShares.organizationId, organizationId)));
    return { ok: true };
  }

  /** Unauthenticated public view — only the explicitly-allow-listed widgets are ever computed or returned. */
  async publicView(token: string) {
    const tokenHash = sha256(token);
    const [share] = await this.db.select().from(schema.dashboardShares).where(eq(schema.dashboardShares.tokenHash, tokenHash)).limit(1);
    if (!share || !share.active || (share.expiresAt && share.expiresAt < new Date())) throw new AppError("NOT_FOUND", "Shared dashboard is unavailable or expired");
    const [dashboard] = await this.db.select().from(schema.dashboards).where(eq(schema.dashboards.id, share.dashboardId)).limit(1);
    if (!dashboard) throw new AppError("NOT_FOUND", "Shared dashboard is unavailable or expired");
    const allowed = new Set(share.widgetIds as string[]);
    const widgets = ((dashboard.widgets as Widget[]) ?? []).filter((w) => allowed.has(w.id));
    const rendered = [];
    for (const w of widgets) {
      try {
        if (w.definitionId) { const snap = await this.metrics.snapshot(dashboard.organizationId, w.definitionId, {}); rendered.push({ id: w.id, type: w.type, title: w.title, value: snap.value, unit: snap.unit, computedAt: snap.computedAt }); }
        else if (w.source) { const { value, unit } = await this.metrics.compute(dashboard.organizationId, w.source, (w.params ?? {}) as any); rendered.push({ id: w.id, type: w.type, title: w.title, value, unit, computedAt: new Date() }); }
      } catch { rendered.push({ id: w.id, type: w.type, title: w.title, value: null, error: "unavailable" }); }
    }
    await this.db.update(schema.dashboardShares).set({ viewCount: share.viewCount + 1 }).where(eq(schema.dashboardShares.id, share.id));
    return { name: dashboard.name, widgets: rendered };
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
