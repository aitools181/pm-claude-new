import { Body, Controller, Get, Param, Post, Req, UseGuards } from "@nestjs/common";
import { Request } from "express";
import { z } from "zod";
import { ZodPipe } from "../common/zod.pipe.js";
import { SessionGuard } from "../auth/guards/session.guard.js";
import { OrgContextGuard } from "../org-context/org-context.guard.js";
import { AuthzGuard } from "../authz/authz.guard.js";
import { RequirePermission } from "../authz/require-permission.decorator.js";
import { CAPABILITIES } from "../authz/capabilities.js";
import { ApprovalsService } from "./approvals.service.js";

type Ctx = Request & { userId: string; organizationId: string };
const stageSpec = z.object({ name: z.string(), rule: z.enum(["any", "all"]), approverUserIds: z.array(z.string().uuid()), dueHours: z.number().positive().optional() });
const defDto = z.object({ name: z.string().min(1), mode: z.enum(["sequential", "parallel"]).optional(), stages: z.array(stageSpec).min(1), lockedFields: z.array(z.string()).optional(), reapprovalPolicy: z.enum(["none", "on_locked_change"]).optional(), escalationUserId: z.string().uuid().optional() });
const startDto = z.object({ definitionId: z.string().uuid().optional(), mode: z.enum(["sequential", "parallel"]).optional(), stages: z.array(stageSpec).optional(), lockedFields: z.array(z.string()).optional(), reapprovalPolicy: z.enum(["none", "on_locked_change"]).optional(), escalationUserId: z.string().uuid().optional() });
const decideDto = z.object({ decision: z.enum(["approved", "rejected"]), comment: z.string().optional() });
const delegateDto = z.object({ toUserId: z.string().uuid() });

@Controller()
@UseGuards(SessionGuard, OrgContextGuard, AuthzGuard)
export class ApprovalsController {
  constructor(private readonly svc: ApprovalsService) {}

  @Post("approval-definitions") @RequirePermission(CAPABILITIES.APPROVAL_MANAGE)
  createDef(@Req() r: Ctx, @Body(new ZodPipe(defDto)) b: z.infer<typeof defDto>) { return this.svc.createDefinition(r.organizationId, r.userId, b); }
  @Get("approval-definitions") listDefs(@Req() r: Ctx) { return this.svc.listDefinitions(r.organizationId); }

  @Post("work-items/:id/approvals") @RequirePermission(CAPABILITIES.APPROVAL_MANAGE)
  start(@Req() r: Ctx, @Param("id") id: string, @Body(new ZodPipe(startDto)) b: z.infer<typeof startDto>) { return this.svc.start(r.organizationId, r.userId, { workItemId: id, ...b }); }

  @Get("approvals/queue/me") queue(@Req() r: Ctx) { return this.svc.queue(r.organizationId, r.userId); }
  @Post("approvals/escalate") @RequirePermission(CAPABILITIES.APPROVAL_MANAGE)
  escalate(@Req() r: Ctx) { return this.svc.escalateOverdue(r.organizationId); }

  @Get("approvals/:id") get(@Req() r: Ctx, @Param("id") id: string) { return this.svc.get(r.organizationId, id); }
  @Get("approvals/:id/history") history(@Req() r: Ctx, @Param("id") id: string) { return this.svc.history(r.organizationId, id); }

  @Post("approval-stages/:stageId/decide")
  decide(@Req() r: Ctx, @Param("stageId") stageId: string, @Body(new ZodPipe(decideDto)) b: z.infer<typeof decideDto>) { return this.svc.decide(r.organizationId, r.userId, stageId, b.decision, b.comment); }
  @Post("approval-stages/:stageId/delegate")
  delegate(@Req() r: Ctx, @Param("stageId") stageId: string, @Body(new ZodPipe(delegateDto)) b: z.infer<typeof delegateDto>) { return this.svc.delegate(r.organizationId, r.userId, stageId, b.toUserId); }
}
