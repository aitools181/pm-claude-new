import { Body, Controller, Get, Param, Post, Req, UseGuards } from "@nestjs/common";
import { Request } from "express";
import { z } from "zod";
import { ZodPipe } from "../common/zod.pipe.js";
import { SessionGuard } from "../auth/guards/session.guard.js";
import { OrgContextGuard } from "../org-context/org-context.guard.js";
import { AuthzGuard } from "../authz/authz.guard.js";
import { RequirePermission } from "../authz/require-permission.decorator.js";
import { CAPABILITIES } from "../authz/capabilities.js";
import { SchedulingService } from "./scheduling.service.js";
import { CascadeService } from "./cascade.service.js";
import { BaselineService } from "./baseline.service.js";

type Ctx = Request & { userId: string; organizationId: string };
const startDto = z.object({ newStart: z.string() });
const baseDto = z.object({ name: z.string().min(1) });

@Controller()
@UseGuards(SessionGuard, OrgContextGuard, AuthzGuard)
export class SchedulingController {
  constructor(private readonly sched: SchedulingService, private readonly cascade: CascadeService, private readonly baseline: BaselineService) {}

  @Get("projects/:id/schedule")
  schedule(@Req() r: Ctx, @Param("id") id: string) { return this.sched.computeForProject(r.organizationId, id); }

  @Get("projects/:id/gantt")
  gantt(@Req() r: Ctx, @Param("id") id: string) { return this.sched.hierarchyRollup(r.organizationId, id); }

  @Post("work-items/:id/reschedule/preview")
  preview(@Req() r: Ctx, @Param("id") id: string, @Body(new ZodPipe(startDto)) b: z.infer<typeof startDto>) {
    return this.cascade.preview(r.organizationId, r.userId, id, b.newStart);
  }

  @Post("work-items/:id/reschedule/confirm") @RequirePermission(CAPABILITIES.SCHEDULE_MANAGE)
  confirm(@Req() r: Ctx, @Param("id") id: string, @Body(new ZodPipe(startDto)) b: z.infer<typeof startDto>) {
    return this.cascade.confirm(r.organizationId, r.userId, id, b.newStart);
  }

  @Post("reschedule/:opId/undo") @RequirePermission(CAPABILITIES.SCHEDULE_MANAGE)
  undo(@Req() r: Ctx, @Param("opId") opId: string) { return this.cascade.undo(r.organizationId, opId); }

  @Post("projects/:id/baselines") @RequirePermission(CAPABILITIES.SCHEDULE_MANAGE)
  capture(@Req() r: Ctx, @Param("id") id: string, @Body(new ZodPipe(baseDto)) b: z.infer<typeof baseDto>) {
    return this.baseline.capture(r.organizationId, r.userId, id, b.name);
  }

  @Get("projects/:id/baselines")
  baselines(@Req() r: Ctx, @Param("id") id: string) { return this.baseline.list(r.organizationId, id); }

  @Get("projects/:id/baselines/:baselineId/variance")
  variance(@Req() r: Ctx, @Param("id") id: string, @Param("baselineId") baselineId: string) { return this.baseline.variance(r.organizationId, id, baselineId); }
}
