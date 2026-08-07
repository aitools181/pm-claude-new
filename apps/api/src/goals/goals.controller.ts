import { Body, Controller, Delete, Get, Param, Patch, Post, Req, UseGuards } from "@nestjs/common";
import { Request } from "express";
import { z } from "zod";
import { ZodPipe } from "../common/zod.pipe.js";
import { SessionGuard } from "../auth/guards/session.guard.js";
import { OrgContextGuard } from "../org-context/org-context.guard.js";
import { AuthzGuard } from "../authz/authz.guard.js";
import { RequirePermission } from "../authz/require-permission.decorator.js";
import { CAPABILITIES } from "../authz/capabilities.js";
import { GoalsService } from "./goals.service.js";

type Ctx = Request & { userId: string; organizationId: string };
const createDto = z.object({ name: z.string().min(1), description: z.string().optional(), parentId: z.string().uuid().optional(), ownerUserId: z.string().uuid().optional(), targetType: z.enum(["percent", "numeric", "binary", "rollup"]).optional(), startValue: z.number().optional(), targetValue: z.number().optional(), currentValue: z.number().optional(), unit: z.string().optional(), dueDate: z.string().optional() });
const patchDto = z.object({ name: z.string().optional(), description: z.string().optional(), targetType: z.string().optional(), startValue: z.number().optional(), targetValue: z.number().optional(), unit: z.string().optional(), dueDate: z.string().optional(), status: z.enum(["active", "closed"]).optional(), parentId: z.string().uuid().nullable().optional() });
const checkinDto = z.object({ currentValue: z.number().optional(), confidence: z.enum(["on_track", "at_risk", "off_track"]).optional(), note: z.string().optional() });
const linkDto = z.object({ kind: z.enum(["project", "work_item", "metric"]), refId: z.string().uuid(), weight: z.number().int().positive().optional() });

@Controller()
@UseGuards(SessionGuard, OrgContextGuard, AuthzGuard)
export class GoalsController {
  constructor(private readonly svc: GoalsService) {}

  @Get("goals") list(@Req() r: Ctx) { return this.svc.list(r.organizationId); }
  @Get("goals/:id") get(@Req() r: Ctx, @Param("id") id: string) { return this.svc.get(r.organizationId, r.userId, id); }
  @Post("goals") @RequirePermission(CAPABILITIES.GOAL_MANAGE)
  create(@Req() r: Ctx, @Body(new ZodPipe(createDto)) b: z.infer<typeof createDto>) { return this.svc.create(r.organizationId, r.userId, b); }
  @Patch("goals/:id") @RequirePermission(CAPABILITIES.GOAL_MANAGE)
  update(@Req() r: Ctx, @Param("id") id: string, @Body(new ZodPipe(patchDto)) b: z.infer<typeof patchDto>) { return this.svc.update(r.organizationId, id, b as any); }
  @Post("goals/:id/check-in")
  checkIn(@Req() r: Ctx, @Param("id") id: string, @Body(new ZodPipe(checkinDto)) b: z.infer<typeof checkinDto>) { return this.svc.checkIn(r.organizationId, r.userId, id, b); }
  @Post("goals/:id/links") @RequirePermission(CAPABILITIES.GOAL_MANAGE)
  addLink(@Req() r: Ctx, @Param("id") id: string, @Body(new ZodPipe(linkDto)) b: z.infer<typeof linkDto>) { return this.svc.addLink(r.organizationId, id, b.kind, b.refId, b.weight ?? 1); }
  @Delete("goal-links/:id") @RequirePermission(CAPABILITIES.GOAL_MANAGE)
  removeLink(@Req() r: Ctx, @Param("id") id: string) { return this.svc.removeLink(r.organizationId, id); }
}
