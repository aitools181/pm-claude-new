import { Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards } from "@nestjs/common";
import { Request } from "express";
import { z } from "zod";
import { ZodPipe } from "../common/zod.pipe.js";
import { SessionGuard } from "../auth/guards/session.guard.js";
import { OrgContextGuard } from "../org-context/org-context.guard.js";
import { AuthzGuard } from "../authz/authz.guard.js";
import { RequirePermission } from "../authz/require-permission.decorator.js";
import { CAPABILITIES } from "../authz/capabilities.js";
import { AiService } from "./ai.service.js";

type Ctx = Request & { userId: string; organizationId: string };
const proposeDto = z.object({ projectId: z.string().uuid(), text: z.string().min(1), useRetrieval: z.boolean().optional() });
const projectSummaryDto = z.object({ includeSources: z.boolean().optional(), includeRiskReport: z.boolean().optional(), regularUpdates: z.boolean().optional(), timeframe: z.enum(["7d","30d","90d"]).optional() });

@Controller("ai")
@UseGuards(SessionGuard, OrgContextGuard, AuthzGuard)
export class AiController {
  constructor(private readonly svc: AiService) {}


  @Get("projects/:projectId/summary") @RequirePermission(CAPABILITIES.AI_USE)
  projectSummary(@Req() r: Ctx, @Param("projectId") projectId: string) { return this.svc.projectSummary(r.organizationId, r.userId, projectId); }
  @Patch("projects/:projectId/summary") @RequirePermission(CAPABILITIES.AI_USE)
  updateProjectSummary(@Req() r: Ctx, @Param("projectId") projectId: string, @Body(new ZodPipe(projectSummaryDto)) b: z.infer<typeof projectSummaryDto>) { return this.svc.updateProjectSummary(r.organizationId, r.userId, projectId, b); }
  @Post("projects/:projectId/summary/generate") @RequirePermission(CAPABILITIES.AI_USE)
  generateProjectSummary(@Req() r: Ctx, @Param("projectId") projectId: string) { return this.svc.generateProjectSummary(r.organizationId, r.userId, projectId); }
  @Get("inbox-summary") @RequirePermission(CAPABILITIES.AI_USE)
  inboxSummary(@Req() r: Ctx, @Query("timeframe") timeframe?: "day" | "week" | "month") { return this.svc.inboxSummary(r.organizationId, r.userId, timeframe); }

  @Get("status") status(@Req() r: Ctx) { return this.svc.status(r.organizationId); }
  @Get("retrieve") retrieve(@Req() r: Ctx, @Query("q") q: string) { return this.svc.retrieve(r.organizationId, r.userId, q ?? ""); }
  @Post("propose-task") @RequirePermission(CAPABILITIES.AI_USE)
  propose(@Req() r: Ctx, @Body(new ZodPipe(proposeDto)) b: z.infer<typeof proposeDto>) { return this.svc.proposeTask(r.organizationId, r.userId, b); }
  @Get("proposals") list(@Req() r: Ctx) { return this.svc.listProposals(r.organizationId); }
  @Post("proposals/:id/confirm") @RequirePermission(CAPABILITIES.AI_USE)
  confirm(@Req() r: Ctx, @Param("id") id: string) { return this.svc.confirmProposal(r.organizationId, r.userId, id); }
  @Post("proposals/:id/reject") @RequirePermission(CAPABILITIES.AI_USE)
  reject(@Req() r: Ctx, @Param("id") id: string) { return this.svc.rejectProposal(r.organizationId, r.userId, id); }
  @Get("audit") audit(@Req() r: Ctx) { return this.svc.auditTrail(r.organizationId); }
}
