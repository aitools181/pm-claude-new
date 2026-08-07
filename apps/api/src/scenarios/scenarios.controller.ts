import { Body, Controller, Get, Param, Post, Req, UseGuards } from "@nestjs/common";
import { Request } from "express";
import { z } from "zod";
import { SessionGuard } from "../auth/guards/session.guard.js";
import { OrgContextGuard } from "../org-context/org-context.guard.js";
import { AuthzGuard } from "../authz/authz.guard.js";
import { RequirePermission } from "../authz/require-permission.decorator.js";
import { CAPABILITIES } from "../authz/capabilities.js";
import { ZodPipe } from "../common/zod.pipe.js";
import { ScenariosService } from "./scenarios.service.js";

type Ctx = Request & { userId: string; organizationId: string };
const createDto = z.object({ name: z.string().min(1), description: z.string().optional(), projectId: z.string().uuid().optional(), portfolioId: z.string().uuid().optional(), objective: z.string().optional() });
const changeDto = z.object({ workItemId: z.string().uuid(), field: z.string().min(1), afterValue: z.unknown(), selectedForCommit: z.boolean().optional() });
const scheduleDto = z.object({ anchorDate: z.string().optional() });
const compareDto = z.object({ scenarioIds: z.array(z.string().uuid()).min(2).max(8) });
const proposalDto = z.object({ selectedChangeIds: z.array(z.string().uuid()).optional() });

@Controller("scenarios")
@UseGuards(SessionGuard, OrgContextGuard, AuthzGuard)
export class ScenariosController {
  constructor(private readonly service: ScenariosService) {}
  @Get() list(@Req() r: Ctx) { return this.service.list(r.organizationId, r.userId); }
  @Post() @RequirePermission(CAPABILITIES.SCENARIO_MANAGE) create(@Req() r: Ctx, @Body(new ZodPipe(createDto)) b: z.infer<typeof createDto>) { return this.service.create(r.organizationId, r.userId, b); }
  @Get(":id") detail(@Req() r: Ctx, @Param("id") id: string) { return this.service.detail(r.organizationId, r.userId, id); }
  @Post(":id/changes") @RequirePermission(CAPABILITIES.SCENARIO_MANAGE) change(@Req() r: Ctx, @Param("id") id: string, @Body(new ZodPipe(changeDto)) b: z.infer<typeof changeDto>) { return this.service.addChange(r.organizationId, r.userId, id, b); }
  @Post(":id/schedule") @RequirePermission(CAPABILITIES.SCENARIO_MANAGE) schedule(@Req() r: Ctx, @Param("id") id: string, @Body(new ZodPipe(scheduleDto)) b: z.infer<typeof scheduleDto>) { return this.service.schedule(r.organizationId, r.userId, id, b); }
  @Post("compare") compare(@Req() r: Ctx, @Body(new ZodPipe(compareDto)) b: z.infer<typeof compareDto>) { return this.service.compare(r.organizationId, r.userId, b.scenarioIds); }
  @Post(":id/proposals") @RequirePermission(CAPABILITIES.SCENARIO_MANAGE) proposal(@Req() r: Ctx, @Param("id") id: string, @Body(new ZodPipe(proposalDto)) b: z.infer<typeof proposalDto>) { return this.service.proposeCommit(r.organizationId, r.userId, id, b.selectedChangeIds); }
  @Post("proposals/:id/commit") @RequirePermission(CAPABILITIES.SCENARIO_MANAGE) commit(@Req() r: Ctx, @Param("id") id: string) { return this.service.approveAndCommit(r.organizationId, r.userId, id); }
}
