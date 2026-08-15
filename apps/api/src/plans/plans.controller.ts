import { Body, Controller, Get, Param, Patch, Post, Req, UseGuards } from "@nestjs/common";
import { Request } from "express";
import { z } from "zod";
import { ZodPipe } from "../common/zod.pipe.js";
import { SessionGuard } from "../auth/guards/session.guard.js";
import { OrgContextGuard } from "../org-context/org-context.guard.js";
import { PlatformAdminGuard } from "../platform/platform-admin.guard.js";
import { PlansService } from "./plans.service.js";

type Ctx = Request & { userId: string; organizationId: string };
const limits = z.object({ maxMembers: z.number().int().nonnegative().nullable().optional(), maxProjects: z.number().int().nonnegative().nullable().optional(), maxWorkItems: z.number().int().nonnegative().nullable().optional() });
const createDto = z.object({ key: z.string().min(1).max(40), name: z.string().min(1).max(80), description: z.string().max(400).optional(), currency: z.string().length(3).optional(), priceMonthly: z.number().int().nonnegative(), priceYearly: z.number().int().nonnegative(), limits: limits.optional(), modules: z.array(z.string()).optional(), isPublic: z.boolean().optional(), sortOrder: z.number().int().optional() });
const updateDto = createDto.partial().omit({ key: true }).extend({ status: z.enum(["active", "retired"]).optional() });
const assignDto = z.object({ planKey: z.string().min(1), seats: z.number().int().positive().nullable().optional(), status: z.enum(["active", "trialing", "past_due", "cancelled"]).optional() });

/** Public pricing — no session required. */
@Controller("pricing")
export class PricingController {
  constructor(private readonly plans: PlansService) {}
  @Get() list() { return this.plans.publicPlans(); }
}

/** What the signed-in organization is entitled to. */
@Controller("billing")
@UseGuards(SessionGuard, OrgContextGuard)
export class BillingController {
  constructor(private readonly plans: PlansService) {}
  @Get("entitlements") entitlements(@Req() r: Ctx) { return this.plans.entitlements(r.organizationId, r.userId); }
}

/** Plan management is platform-level, never organization-level. */
@Controller("superadmin/plans")
@UseGuards(SessionGuard, PlatformAdminGuard)
export class PlanAdminController {
  constructor(private readonly plans: PlansService) {}
  @Get() list() { return this.plans.list(); }
  @Post("seed") seed(@Req() r: Ctx) { return this.plans.seedDefaults(r.userId); }
  @Post() create(@Req() r: Ctx, @Body(new ZodPipe(createDto)) b: z.infer<typeof createDto>) { return this.plans.createPlan(r.userId, b); }
  @Patch(":key") update(@Req() r: Ctx, @Param("key") key: string, @Body(new ZodPipe(updateDto)) b: z.infer<typeof updateDto>) { return this.plans.updatePlan(r.userId, key, b); }
  @Post(":key/retire") retire(@Req() r: Ctx, @Param("key") key: string) { return this.plans.retirePlan(r.userId, key); }
  @Get("organizations/:id") orgPlan(@Param("id") id: string) { return this.plans.entitlements(id); }
  @Post("organizations/:id") assign(@Req() r: Ctx, @Param("id") id: string, @Body(new ZodPipe(assignDto)) b: z.infer<typeof assignDto>) { return this.plans.assignPlan(r.userId, id, b.planKey, { seats: b.seats ?? null, status: b.status }); }
}
