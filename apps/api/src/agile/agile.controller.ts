import { Body, Controller, Delete, Get, Param, Post, Query, Req, UseGuards } from "@nestjs/common";
import { Request } from "express";
import { z } from "zod";
import { ZodPipe } from "../common/zod.pipe.js";
import { SessionGuard } from "../auth/guards/session.guard.js";
import { OrgContextGuard } from "../org-context/org-context.guard.js";
import { AuthzGuard } from "../authz/authz.guard.js";
import { RequirePermission } from "../authz/require-permission.decorator.js";
import { CAPABILITIES } from "../authz/capabilities.js";
import { BacklogService } from "./backlog.service.js";
import { SprintService } from "./sprint.service.js";
import { AgileMetricsService } from "./metrics.service.js";
import { ReleaseService } from "./release.service.js";

type Ctx = Request & { userId: string; organizationId: string };
const sprintDto = z.object({ name: z.string().min(1), goal: z.string().optional(), startDate: z.string().optional(), endDate: z.string().optional() });
const rankDto = z.object({ beforeId: z.string().uuid().nullable().optional(), afterId: z.string().uuid().nullable().optional() });
const pointsDto = z.object({ storyPoints: z.number().int().min(0).nullable() });
const itemDto = z.object({ workItemId: z.string().uuid() });
const closeDto = z.object({ carryOverToSprintId: z.string().uuid().nullable().optional() });
const releaseDto = z.object({ name: z.string().min(1), version: z.string().optional(), releaseDate: z.string().optional(), notes: z.string().optional() });

@Controller()
@UseGuards(SessionGuard, OrgContextGuard, AuthzGuard)
export class AgileController {
  constructor(private backlog: BacklogService, private sprints: SprintService, private metrics: AgileMetricsService, private releases: ReleaseService) {}

  // backlog
  @Get("projects/:id/backlog") list(@Req() r: Ctx, @Param("id") id: string) { return this.backlog.list(r.organizationId, id); }
  @Post("work-items/:id/backlog-rank") @RequirePermission(CAPABILITIES.SPRINT_MANAGE)
  rank(@Req() r: Ctx, @Param("id") id: string, @Body(new ZodPipe(rankDto)) b: z.infer<typeof rankDto>) { return this.backlog.move(r.organizationId, id, b.beforeId ?? null, b.afterId ?? null); }
  @Post("work-items/:id/points") @RequirePermission(CAPABILITIES.SPRINT_MANAGE)
  points(@Req() r: Ctx, @Param("id") id: string, @Body(new ZodPipe(pointsDto)) b: z.infer<typeof pointsDto>) { return this.backlog.setPoints(r.organizationId, id, b.storyPoints); }

  // sprints
  @Post("projects/:id/sprints") @RequirePermission(CAPABILITIES.SPRINT_MANAGE)
  create(@Req() r: Ctx, @Param("id") id: string, @Body(new ZodPipe(sprintDto)) b: z.infer<typeof sprintDto>) { return this.sprints.create(r.organizationId, id, b); }
  @Get("projects/:id/sprints") sprintList(@Req() r: Ctx, @Param("id") id: string) { return this.sprints.list(r.organizationId, id); }
  @Get("sprints/:id") get(@Req() r: Ctx, @Param("id") id: string) { return this.sprints.get(r.organizationId, id); }
  @Post("sprints/:id/items") @RequirePermission(CAPABILITIES.SPRINT_MANAGE)
  addItem(@Req() r: Ctx, @Param("id") id: string, @Body(new ZodPipe(itemDto)) b: z.infer<typeof itemDto>) { return this.sprints.addItem(r.organizationId, r.userId, id, b.workItemId); }
  @Delete("sprints/:id/items/:workItemId") @RequirePermission(CAPABILITIES.SPRINT_MANAGE)
  removeItem(@Req() r: Ctx, @Param("id") id: string, @Param("workItemId") w: string) { return this.sprints.removeItem(r.organizationId, r.userId, id, w); }
  @Post("sprints/:id/start") @RequirePermission(CAPABILITIES.SPRINT_MANAGE)
  start(@Req() r: Ctx, @Param("id") id: string) { return this.sprints.start(r.organizationId, id); }
  @Post("sprints/:id/close") @RequirePermission(CAPABILITIES.SPRINT_MANAGE)
  close(@Req() r: Ctx, @Param("id") id: string, @Body(new ZodPipe(closeDto)) b: z.infer<typeof closeDto>) { return this.sprints.close(r.organizationId, id, { carryOverToSprintId: b.carryOverToSprintId ?? null }); }
  @Get("sprints/:id/scope-events") scope(@Req() r: Ctx, @Param("id") id: string) { return this.sprints.scopeEvents(r.organizationId, id); }

  // metrics
  @Get("projects/:id/velocity") velocity(@Req() r: Ctx, @Param("id") id: string) { return this.metrics.velocity(r.organizationId, id); }
  @Get("projects/:id/committed-vs-completed") cvc(@Req() r: Ctx, @Param("id") id: string) { return this.metrics.committedVsCompleted(r.organizationId, id); }
  @Get("sprints/:id/burndown") burndown(@Req() r: Ctx, @Param("id") id: string) { return this.metrics.burndown(r.organizationId, id); }
  @Get("sprints/:id/burnup") burnup(@Req() r: Ctx, @Param("id") id: string) { return this.metrics.burnup(r.organizationId, id); }
  @Get("projects/:id/cycle-lead-time") clt(@Req() r: Ctx, @Param("id") id: string) { return this.metrics.cycleLeadTime(r.organizationId, id); }
  @Get("projects/:id/cfd") cfd(@Req() r: Ctx, @Param("id") id: string, @Query("from") from: string, @Query("to") to: string) { return this.metrics.cfd(r.organizationId, id, from, to); }

  // releases
  @Post("projects/:id/releases") @RequirePermission(CAPABILITIES.SPRINT_MANAGE)
  createRelease(@Req() r: Ctx, @Param("id") id: string, @Body(new ZodPipe(releaseDto)) b: z.infer<typeof releaseDto>) { return this.releases.create(r.organizationId, id, b); }
  @Get("projects/:id/releases") releaseList(@Req() r: Ctx, @Param("id") id: string) { return this.releases.list(r.organizationId, id); }
  @Get("releases/:id") getRelease(@Req() r: Ctx, @Param("id") id: string) { return this.releases.get(r.organizationId, id); }
  @Get("releases/:id/notes") releaseNotes(@Req() r: Ctx, @Param("id") id: string) { return this.releases.notes(r.organizationId, id); }
  @Post("releases/:id/items") @RequirePermission(CAPABILITIES.SPRINT_MANAGE)
  addRelItem(@Req() r: Ctx, @Param("id") id: string, @Body(new ZodPipe(itemDto)) b: z.infer<typeof itemDto>) { return this.releases.addItem(r.organizationId, id, b.workItemId); }
  @Delete("releases/:id/items/:workItemId") @RequirePermission(CAPABILITIES.SPRINT_MANAGE)
  removeRelItem(@Req() r: Ctx, @Param("id") id: string, @Param("workItemId") w: string) { return this.releases.removeItem(r.organizationId, id, w); }
  @Post("releases/:id/publish") @RequirePermission(CAPABILITIES.SPRINT_MANAGE)
  publishRelease(@Req() r: Ctx, @Param("id") id: string) { return this.releases.publish(r.organizationId, id); }
}
