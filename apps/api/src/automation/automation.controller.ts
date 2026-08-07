import { Body, Controller, Get, Param, Post, Req, UseGuards } from "@nestjs/common";
import { Request } from "express";
import { z } from "zod";
import { ZodPipe } from "../common/zod.pipe.js";
import { SessionGuard } from "../auth/guards/session.guard.js";
import { OrgContextGuard } from "../org-context/org-context.guard.js";
import { AuthzGuard } from "../authz/authz.guard.js";
import { RequirePermission } from "../authz/require-permission.decorator.js";
import { CAPABILITIES } from "../authz/capabilities.js";
import { AutomationService } from "./automation.service.js";

type Ctx = Request & { userId: string; organizationId: string };
const ruleDto = z.object({ name: z.string().min(1), triggerType: z.enum(["event", "schedule", "manual"]), triggerConfig: z.record(z.any()).optional(), disableOnFailure: z.boolean().optional() });
const condDto = z.object({ kind: z.string(), config: z.record(z.any()).optional() });
const actDto = z.object({ kind: z.string(), config: z.record(z.any()).optional(), rank: z.number().optional() });
const fireDto = z.object({ eventName: z.string(), eventId: z.string(), payload: z.record(z.any()).optional() });

@Controller("automation")
@UseGuards(SessionGuard, OrgContextGuard, AuthzGuard)
export class AutomationController {
  constructor(private readonly auto: AutomationService) {}

  @Get("rules") @RequirePermission(CAPABILITIES.AUTOMATION_MANAGE)
  list(@Req() r: Ctx) { return this.auto.list(r.organizationId); }

  @Post("rules") @RequirePermission(CAPABILITIES.AUTOMATION_MANAGE)
  create(@Req() r: Ctx, @Body(new ZodPipe(ruleDto)) b: z.infer<typeof ruleDto>) { return this.auto.createRule(r.organizationId, r.userId, b); }

  @Post("rules/:id/conditions") @RequirePermission(CAPABILITIES.AUTOMATION_MANAGE)
  addCond(@Req() r: Ctx, @Param("id") id: string, @Body(new ZodPipe(condDto)) b: z.infer<typeof condDto>) { return this.auto.addCondition(r.organizationId, id, b.kind, b.config); }

  @Post("rules/:id/actions") @RequirePermission(CAPABILITIES.AUTOMATION_MANAGE)
  addAct(@Req() r: Ctx, @Param("id") id: string, @Body(new ZodPipe(actDto)) b: z.infer<typeof actDto>) { return this.auto.addAction(r.organizationId, id, b.kind, b.config, b.rank ?? 0); }

  @Post("rules/:id/enable") @RequirePermission(CAPABILITIES.AUTOMATION_MANAGE)
  enable(@Req() r: Ctx, @Param("id") id: string, @Body(new ZodPipe(z.object({ enabled: z.boolean() }))) b: { enabled: boolean }) { return this.auto.setEnabled(r.organizationId, id, b.enabled).then(() => ({ ok: true })); }

  /** Manual trigger, optionally as a dry run (no side effects). */
  @Post("rules/:id/run") @RequirePermission(CAPABILITIES.AUTOMATION_MANAGE)
  run(@Req() r: Ctx, @Param("id") id: string, @Body(new ZodPipe(z.object({ payload: z.record(z.any()).optional(), dryRun: z.boolean().optional() }))) b: { payload?: any; dryRun?: boolean }) {
    return this.auto.manualTrigger(r.organizationId, id, b.payload ?? {}, r.userId, b.dryRun ?? false);
  }

  /** Fire an internal domain event (test-event / integration point). */
  @Post("events") @RequirePermission(CAPABILITIES.AUTOMATION_MANAGE)
  fire(@Req() r: Ctx, @Body(new ZodPipe(fireDto)) b: z.infer<typeof fireDto>) {
    return this.auto.dispatchEvent(r.organizationId, b.eventName, b.eventId, b.payload ?? {}, r.userId);
  }

  @Post("runs/:runId/replay") @RequirePermission(CAPABILITIES.AUTOMATION_MANAGE)
  replay(@Req() r: Ctx, @Param("runId") id: string) { return this.auto.replay(r.organizationId, id); }

  @Get("rules/:id/runs") @RequirePermission(CAPABILITIES.AUTOMATION_MANAGE)
  runs(@Req() r: Ctx, @Param("id") id: string) { return this.auto.runs(r.organizationId, id); }

  @Get("runs/:runId/steps") @RequirePermission(CAPABILITIES.AUTOMATION_MANAGE)
  steps(@Param("runId") id: string) { return this.auto.steps(id); }
}
