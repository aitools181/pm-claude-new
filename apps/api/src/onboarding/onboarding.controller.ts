import { Body, Controller, Delete, Get, Param, Post, Req, UseGuards } from "@nestjs/common";
import { Request } from "express";
import { z } from "zod";
import { ZodPipe } from "../common/zod.pipe.js";
import { SessionGuard } from "../auth/guards/session.guard.js";
import { OrgContextGuard } from "../org-context/org-context.guard.js";
import { AuthzGuard } from "../authz/authz.guard.js";
import { RequirePermission } from "../authz/require-permission.decorator.js";
import { CAPABILITIES } from "../authz/capabilities.js";
import { OnboardingService } from "./onboarding.service.js";

type Ctx = Request & { userId: string; organizationId: string };

@Controller()
@UseGuards(SessionGuard, OrgContextGuard, AuthzGuard)
export class OnboardingController {
  constructor(private readonly svc: OnboardingService) {}

  // ---- checklist ----
  @Get("onboarding/progress")
  progress(@Req() r: Ctx) { return this.svc.progress(r.organizationId, r.userId); }
  @Post("onboarding/progress/:itemKey")
  markDone(@Req() r: Ctx, @Param("itemKey") itemKey: string) { return this.svc.markItemDone(r.organizationId, r.userId, itemKey); }
  @Post("onboarding/dismiss")
  dismiss(@Req() r: Ctx) { return this.svc.dismissChecklist(r.organizationId, r.userId); }

  // ---- sample data ----
  @Post("onboarding/sample-data") @RequirePermission(CAPABILITIES.ORG_SETTINGS_MANAGE)
  createSample(@Req() r: Ctx) { return this.svc.createSampleData(r.organizationId, r.userId); }
  @Delete("onboarding/sample-data") @RequirePermission(CAPABILITIES.ORG_SETTINGS_MANAGE)
  removeSample(@Req() r: Ctx) { return this.svc.removeSampleData(r.organizationId); }

  // ---- feature spotlight ----
  @Post("onboarding/spotlights/unseen")
  unseen(@Req() r: Ctx, @Body(new ZodPipe(z.object({ keys: z.array(z.string().max(80)).max(20) }))) b: { keys: string[] }) {
    return this.svc.unseenSpotlights(r.organizationId, r.userId, b.keys);
  }
  @Post("onboarding/spotlights/:key/seen")
  markSeen(@Req() r: Ctx, @Param("key") key: string, @Body(new ZodPipe(z.object({ permanent: z.boolean().optional() }))) b: { permanent?: boolean }) {
    return this.svc.markSpotlightSeen(r.organizationId, r.userId, key, Boolean(b.permanent));
  }

  // ---- adoption analytics + telemetry ----
  @Post("onboarding/usage")
  recordUsage(@Req() r: Ctx, @Body(new ZodPipe(z.object({ feature: z.string().min(1).max(80) }))) b: { feature: string }) {
    return this.svc.recordUsage(r.organizationId, r.userId, b.feature).then(() => ({ ok: true }));
  }
  @Get("admin/adoption/funnel") @RequirePermission(CAPABILITIES.ORG_SETTINGS_MANAGE)
  funnel(@Req() r: Ctx) { return this.svc.activationFunnel(r.organizationId); }
  @Get("admin/adoption/unused-modules") @RequirePermission(CAPABILITIES.ORG_SETTINGS_MANAGE)
  unusedModules(@Req() r: Ctx) { return this.svc.unusedModulesReport(r.organizationId); }
  @Get("telemetry-settings") @RequirePermission(CAPABILITIES.ORG_SETTINGS_MANAGE)
  telemetry(@Req() r: Ctx) { return this.svc.telemetrySettings(r.organizationId); }
  @Post("telemetry-settings") @RequirePermission(CAPABILITIES.ORG_SETTINGS_MANAGE)
  setTelemetry(@Req() r: Ctx, @Body(new ZodPipe(z.object({ category: z.enum(["usage", "performance", "errors"]), enabled: z.boolean() }))) b: { category: string; enabled: boolean }) {
    return this.svc.setTelemetry(r.organizationId, r.userId, b.category, b.enabled);
  }
}
