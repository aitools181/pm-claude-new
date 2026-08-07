import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from "@nestjs/common";
import type { Request } from "express";
import { z } from "zod";
import { ZodPipe } from "../common/zod.pipe.js";
import { SessionGuard } from "../auth/guards/session.guard.js";
import { OrgContextGuard } from "../org-context/org-context.guard.js";
import { AuthzGuard } from "../authz/authz.guard.js";
import { RequirePermission } from "../authz/require-permission.decorator.js";
import { CAPABILITIES } from "../authz/capabilities.js";
import { WqlService } from "./wql.service.js";

type Ctx = Request & { userId: string; organizationId: string };
const runDto = z.object({ wql: z.string().min(1), limit: z.number().int().positive().max(500).optional(), offset: z.number().int().nonnegative().optional() });
const saveDto = z.object({ name: z.string().min(1), wql: z.string().min(1) });
const layoutDto = z.object({ typeKey: z.string().min(1), screen: z.enum(["create", "view", "edit", "quick_create", "transition"]), fields: z.array(z.string()) });
const subscribeDto = z.object({ schedule: z.string().optional(), channel: z.enum(["in_app", "email"]).optional(), onlyWhenChanged: z.boolean().optional(), nextRunAt: z.string().datetime().optional() });
const bundleDto = z.object({ name: z.string().min(1), description: z.string().optional(), captureCurrent: z.boolean().optional(), snapshot: z.record(z.unknown()).optional() });
const versionDto = z.object({ snapshot: z.record(z.unknown()).optional(), changeSummary: z.string().optional() });
const applyDto = z.object({ projectId: z.string().uuid(), version: z.number().int().positive() });

@Controller()
@UseGuards(SessionGuard, OrgContextGuard, AuthzGuard)
export class WqlController {
  constructor(private readonly svc: WqlService) {}
  @Get("wql/metadata") metadata() { return this.svc.metadata(); }
  @Post("wql/run") run(@Req() r: Ctx, @Body(new ZodPipe(runDto)) b: z.infer<typeof runDto>) { return this.svc.run(r.organizationId, r.userId, b.wql, b); }
  @Post("wql/explain") explain(@Body(new ZodPipe(runDto.pick({ wql: true }))) b: { wql: string }) { return this.svc.explain(b.wql); }
  @Get("wql/saved") listSaved(@Req() r: Ctx) { return this.svc.listSaved(r.organizationId); }
  @Post("wql/saved") save(@Req() r: Ctx, @Body(new ZodPipe(saveDto)) b: z.infer<typeof saveDto>) { return this.svc.save(r.organizationId, r.userId, b.name, b.wql); }
  @Post("wql/saved/:id/subscribe") subscribe(@Req() r: Ctx, @Param("id") id: string, @Body(new ZodPipe(subscribeDto)) b: z.infer<typeof subscribeDto>) { return this.svc.subscribe(r.organizationId, r.userId, id, b); }
  @Get("wql/subscriptions") subscriptions(@Req() r: Ctx) { return this.svc.subscriptions(r.organizationId, r.userId); }

  @Get("screen-schemes") getLayout(@Req() r: Ctx, @Query("typeKey") typeKey: string, @Query("screen") screen: string) { return this.svc.getLayout(r.organizationId, typeKey, screen); }
  @Post("screen-schemes") @RequirePermission(CAPABILITIES.SCREEN_MANAGE)
  setLayout(@Req() r: Ctx, @Body(new ZodPipe(layoutDto)) b: z.infer<typeof layoutDto>) { return this.svc.setLayout(r.organizationId, b.typeKey, b.screen, b.fields); }

  @Post("configuration-bundles") @RequirePermission(CAPABILITIES.CONFIG_MANAGE)
  createBundle(@Req() r: Ctx, @Body(new ZodPipe(bundleDto)) b: z.infer<typeof bundleDto>) { return this.svc.createBundle(r.organizationId, r.userId, b); }
  @Get("configuration-bundles/:id") @RequirePermission(CAPABILITIES.CONFIG_MANAGE)
  bundle(@Req() r: Ctx, @Param("id") id: string) { return this.svc.bundleDetail(r.organizationId, id); }
  @Post("configuration-bundles/:id/versions") @RequirePermission(CAPABILITIES.CONFIG_MANAGE)
  version(@Req() r: Ctx, @Param("id") id: string, @Body(new ZodPipe(versionDto)) b: z.infer<typeof versionDto>) { return this.svc.createBundleVersion(r.organizationId, r.userId, id, b); }
  @Get("configuration-bundles/:id/diff") @RequirePermission(CAPABILITIES.CONFIG_MANAGE)
  compare(@Req() r: Ctx, @Param("id") id: string, @Query("from") from: string, @Query("to") to: string) { return this.svc.compareBundleVersions(r.organizationId, id, Number(from), Number(to)); }
  @Post("configuration-bundles/:id/versions/:version/publish") @RequirePermission(CAPABILITIES.CONFIG_MANAGE)
  publish(@Req() r: Ctx, @Param("id") id: string, @Param("version") version: string) { return this.svc.publishBundleVersion(r.organizationId, id, Number(version)); }
  @Post("configuration-bundles/:id/apply") @RequirePermission(CAPABILITIES.CONFIG_MANAGE)
  apply(@Req() r: Ctx, @Param("id") id: string, @Body(new ZodPipe(applyDto)) b: z.infer<typeof applyDto>) { return this.svc.applyBundle(r.organizationId, r.userId, b.projectId, id, b.version); }
}
