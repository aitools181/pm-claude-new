import { Body, Controller, Get, Param, Post, Query, Req, UseGuards, UseInterceptors } from "@nestjs/common";
import { Request } from "express";
import { z } from "zod";
import { ZodPipe } from "../common/zod.pipe.js";
import { SessionGuard } from "../auth/guards/session.guard.js";
import { OrgContextGuard } from "../org-context/org-context.guard.js";
import { AuthzGuard } from "../authz/authz.guard.js";
import { RequirePermission } from "../authz/require-permission.decorator.js";
import { CAPABILITIES } from "../authz/capabilities.js";
import { WorkItemMobilityService } from "./work-item-mobility.service.js";
import { IdempotencyInterceptor } from "../api/idempotency.interceptor.js";

type Ctx = Request & { userId: string; organizationId: string };
const reparentDto = z.object({ newParentId: z.string().uuid().nullable() });
const cloneDto = z.object({ includeSubtasks: z.boolean().optional(), keepOwner: z.boolean().optional(), keepDates: z.boolean().optional() });
const bulkDto = z.object({ projectId: z.string().uuid(), lines: z.array(z.string()) });
const previewDto = z.object({ action: z.enum(["promote", "demote", "reparent", "archive", "delete"]), targetParentId: z.string().uuid().nullable().optional() });
const demoteDto = z.object({ parentId: z.string().uuid() });
const rollbackDto = z.object({ reason: z.string().optional(), dryRun: z.boolean().optional() });
const moveDto = z.object({ destinationProjectId: z.string().uuid(), hierarchyHandling: z.enum(["single", "subtree", "promote_children"]).optional(), reason: z.string().optional(), dryRun: z.boolean().optional() });

@Controller()
@UseGuards(SessionGuard, OrgContextGuard, AuthzGuard)
@UseInterceptors(IdempotencyInterceptor)
export class MobilityController {
  constructor(private readonly svc: WorkItemMobilityService) {}

  @Post("work-items/:id/hierarchy-preview") @RequirePermission(CAPABILITIES.WORKITEM_EDIT)
  preview(@Req() r: Ctx, @Param("id") id: string, @Body(new ZodPipe(previewDto)) b: z.infer<typeof previewDto>) { return this.svc.hierarchyPreview(r.organizationId, r.userId, id, b); }
  @Post("work-items/:id/promote") @RequirePermission(CAPABILITIES.WORKITEM_EDIT)
  promote(@Req() r: Ctx, @Param("id") id: string) { return this.svc.promote(r.organizationId, r.userId, id); }
  @Post("work-items/:id/demote") @RequirePermission(CAPABILITIES.WORKITEM_EDIT)
  demote(@Req() r: Ctx, @Param("id") id: string, @Body(new ZodPipe(demoteDto)) b: z.infer<typeof demoteDto>) { return this.svc.demote(r.organizationId, r.userId, id, b.parentId); }
  @Post("work-items/:id/reparent") @RequirePermission(CAPABILITIES.WORKITEM_EDIT)
  reparent(@Req() r: Ctx, @Param("id") id: string, @Body(new ZodPipe(reparentDto)) b: z.infer<typeof reparentDto>) { return this.svc.reparent(r.organizationId, r.userId, id, b.newParentId); }
  @Post("work-items/:id/clone") @RequirePermission(CAPABILITIES.WORKITEM_CREATE)
  clone(@Req() r: Ctx, @Param("id") id: string, @Body(new ZodPipe(cloneDto)) b: z.infer<typeof cloneDto>) { return this.svc.clone(r.organizationId, r.userId, id, b); }
  @Post("work-items/bulk") @RequirePermission(CAPABILITIES.WORKITEM_CREATE)
  bulk(@Req() r: Ctx, @Body(new ZodPipe(bulkDto)) b: z.infer<typeof bulkDto>) { return this.svc.bulkCreate(r.organizationId, r.userId, b.projectId, b.lines); }
  @Post("work-items/:id/move") @RequirePermission(CAPABILITIES.WORKITEM_EDIT)
  move(@Req() r: Ctx, @Param("id") id: string, @Body(new ZodPipe(moveDto)) b: z.infer<typeof moveDto>) { return this.svc.move(r.organizationId, r.userId, id, b); }
  @Post("work-items/:id/move/rollback") @RequirePermission(CAPABILITIES.WORKITEM_EDIT)
  rollback(@Req() r: Ctx, @Param("id") id: string, @Body(new ZodPipe(rollbackDto)) b: z.infer<typeof rollbackDto>) { return this.svc.rollbackLatestMove(r.organizationId, r.userId, id, b.reason, b.dryRun); }
  @Get("work-items/resolve-key") resolve(@Req() r: Ctx, @Query("key") key: string) { return this.svc.resolveKey(r.organizationId, key, r.userId); }
}
