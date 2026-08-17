import { Body, Controller, Delete, Get, Param, Patch, Post, Req, UseGuards } from "@nestjs/common";
import { Request } from "express";
import { z } from "zod";
import { ZodPipe } from "../common/zod.pipe.js";
import { SessionGuard } from "../auth/guards/session.guard.js";
import { OrgContextGuard } from "../org-context/org-context.guard.js";
import { AuthzGuard } from "../authz/authz.guard.js";
import { RequirePermission } from "../authz/require-permission.decorator.js";
import { CAPABILITIES } from "../authz/capabilities.js";
import { DashboardService } from "./dashboard.service.js";
import { MetricService } from "./metric.service.js";

type Ctx = Request & { userId: string; organizationId: string };
const createDto = z.object({ name: z.string().min(1), visibility: z.enum(["private", "team", "project", "org"]).optional(), scopeId: z.string().uuid().optional(), widgets: z.array(z.any()).optional() });
const patchDto = z.object({ name: z.string().optional(), visibility: z.enum(["private", "team", "project", "org"]).optional(), widgets: z.array(z.any()).optional() });
const defDto = z.object({ key: z.string().min(1), name: z.string().min(1), source: z.string().min(1), params: z.record(z.any()).optional(), unit: z.string().optional() });
const shareDto = z.object({ widgetIds: z.array(z.string()).min(1), expiresInDays: z.number().int().min(1).max(365).nullable().optional() });

@Controller()
@UseGuards(SessionGuard, OrgContextGuard, AuthzGuard)
export class DashboardsController {
  constructor(private dashboards: DashboardService, private metrics: MetricService) {}

  @Get("metric-catalogue") catalogue() { return this.metrics.catalogue(); }
  @Get("metric-definitions") defs(@Req() r: Ctx) { return this.metrics.listDefinitions(r.organizationId); }
  @Post("metric-definitions") @RequirePermission(CAPABILITIES.DASHBOARD_MANAGE)
  createDef(@Req() r: Ctx, @Body(new ZodPipe(defDto)) b: z.infer<typeof defDto>) { return this.metrics.createDefinition(r.organizationId, b); }
  @Get("metric-definitions/:id/snapshot") snapshot(@Req() r: Ctx, @Param("id") id: string) { return this.metrics.snapshot(r.organizationId, id, {}); }
  @Post("metric-definitions/:id/refresh") @RequirePermission(CAPABILITIES.DASHBOARD_MANAGE)
  refresh(@Req() r: Ctx, @Param("id") id: string) { return this.metrics.snapshot(r.organizationId, id, { force: true }); }

  @Get("dashboards") list(@Req() r: Ctx) { return this.dashboards.list(r.organizationId, r.userId); }
  @Post("dashboards") @RequirePermission(CAPABILITIES.DASHBOARD_MANAGE)
  create(@Req() r: Ctx, @Body(new ZodPipe(createDto)) b: z.infer<typeof createDto>) { return this.dashboards.create(r.organizationId, r.userId, b as any); }
  @Patch("dashboards/:id") @RequirePermission(CAPABILITIES.DASHBOARD_MANAGE)
  update(@Req() r: Ctx, @Param("id") id: string, @Body(new ZodPipe(patchDto)) b: z.infer<typeof patchDto>) { return this.dashboards.update(r.organizationId, r.userId, id, b as any); }
  @Get("dashboards/:id/render") render(@Req() r: Ctx, @Param("id") id: string) { return this.dashboards.render(r.organizationId, r.userId, id); }
  @Get("dashboards/:id/widgets/:widgetId/drill") drill(@Req() r: Ctx, @Param("id") id: string, @Param("widgetId") w: string) { return this.dashboards.drill(r.organizationId, r.userId, id, w); }

  // ---- F21 external share links ----
  @Post("dashboards/:id/shares") @RequirePermission(CAPABILITIES.DASHBOARD_MANAGE)
  createShare(@Req() r: Ctx, @Param("id") id: string, @Body(new ZodPipe(shareDto)) b: z.infer<typeof shareDto>) { return this.dashboards.createShare(r.organizationId, r.userId, id, b); }
  @Get("dashboards/:id/shares") @RequirePermission(CAPABILITIES.DASHBOARD_MANAGE)
  listShares(@Req() r: Ctx, @Param("id") id: string) { return this.dashboards.listShares(r.organizationId, id); }
  @Delete("dashboards/shares/:shareId") @RequirePermission(CAPABILITIES.DASHBOARD_MANAGE)
  revokeShare(@Req() r: Ctx, @Param("shareId") shareId: string) { return this.dashboards.revokeShare(r.organizationId, shareId); }
}

/** Unauthenticated — the only data ever returned is the widget allow-list on the share record. */
@Controller("public/dashboards")
export class PublicDashboardsController {
  constructor(private dashboards: DashboardService) {}
  @Get(":token") view(@Param("token") token: string) { return this.dashboards.publicView(token); }
}
