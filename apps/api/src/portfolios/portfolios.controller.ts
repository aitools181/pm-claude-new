import { Body, Controller, Delete, Get, Param, Patch, Post, Req, UseGuards } from "@nestjs/common";
import { Request } from "express";
import { z } from "zod";
import { ZodPipe } from "../common/zod.pipe.js";
import { SessionGuard } from "../auth/guards/session.guard.js";
import { OrgContextGuard } from "../org-context/org-context.guard.js";
import { AuthzGuard } from "../authz/authz.guard.js";
import { RequirePermission } from "../authz/require-permission.decorator.js";
import { CAPABILITIES } from "../authz/capabilities.js";
import { PortfolioService } from "./portfolio.service.js";

type Ctx = Request & { userId: string; organizationId: string };
const createDto = z.object({ name: z.string().min(1), description: z.string().optional() });
const projectDto = z.object({ projectId: z.string().uuid() });
const projectMetaDto = z.object({ budgetCents: z.number().int().nonnegative().nullable().optional(), serviceLine: z.string().trim().max(120).nullable().optional(), customFields: z.record(z.unknown()).optional() });
const columnDto = z.object({ name: z.string().trim().min(1).max(100), type: z.enum(["text","number","currency","date","select"]).optional() });
const columnPatchDto = z.object({ name: z.string().trim().min(1).max(100).optional(), type: z.enum(["text","number","currency","date","select"]).optional(), rank: z.number().int().min(0).optional(), config: z.record(z.unknown()).optional() });
const initDto = z.object({ name: z.string().min(1), description: z.string().optional(), leadUserId: z.string().uuid().optional(), targetDate: z.string().optional() });
const msDto = z.object({ name: z.string().min(1), dueDate: z.string().optional(), initiativeId: z.string().uuid().optional() });
const statusDto = z.object({ status: z.string().min(1) });

@Controller()
@UseGuards(SessionGuard, OrgContextGuard, AuthzGuard)
export class PortfoliosController {
  constructor(private readonly svc: PortfolioService) {}

  @Get("portfolios") list(@Req() r: Ctx) { return this.svc.list(r.organizationId); }
  @Post("portfolios") @RequirePermission(CAPABILITIES.PORTFOLIO_MANAGE)
  create(@Req() r: Ctx, @Body(new ZodPipe(createDto)) b: z.infer<typeof createDto>) { return this.svc.create(r.organizationId, r.userId, b); }
  @Get("portfolios/:id/rollup") rollup(@Req() r: Ctx, @Param("id") id: string) { return this.svc.rollup(r.organizationId, r.userId, id); }
  @Get("portfolios/:id/timeline") timeline(@Req() r: Ctx, @Param("id") id: string) { return this.svc.timeline(r.organizationId, r.userId, id); }

  @Post("portfolios/:id/projects") @RequirePermission(CAPABILITIES.PORTFOLIO_MANAGE)
  addProject(@Req() r: Ctx, @Param("id") id: string, @Body(new ZodPipe(projectDto)) b: z.infer<typeof projectDto>) { return this.svc.addProject(r.organizationId, id, b.projectId); }
  @Delete("portfolios/:id/projects/:projectId") @RequirePermission(CAPABILITIES.PORTFOLIO_MANAGE)
  removeProject(@Req() r: Ctx, @Param("id") id: string, @Param("projectId") pid: string) { return this.svc.removeProject(r.organizationId, id, pid); }
  @Get("portfolio-projects") projectMemberships(@Req() r: Ctx) { return this.svc.projectMemberships(r.organizationId, r.userId); }
  @Patch("portfolios/:id/projects/:projectId") @RequirePermission(CAPABILITIES.PORTFOLIO_MANAGE)
  updateProjectMeta(@Req() r: Ctx, @Param("id") id: string, @Param("projectId") pid: string, @Body(new ZodPipe(projectMetaDto)) b: z.infer<typeof projectMetaDto>) { return this.svc.updateProjectMeta(r.organizationId, id, pid, b); }
  @Get("portfolios/:id/columns") columns(@Req() r: Ctx, @Param("id") id: string) { return this.svc.listColumns(r.organizationId, id); }
  @Post("portfolios/:id/columns") @RequirePermission(CAPABILITIES.PORTFOLIO_MANAGE)
  createColumn(@Req() r: Ctx, @Param("id") id: string, @Body(new ZodPipe(columnDto)) b: z.infer<typeof columnDto>) { return this.svc.createColumn(r.organizationId, id, b); }
  @Patch("portfolios/:id/columns/:columnId") @RequirePermission(CAPABILITIES.PORTFOLIO_MANAGE)
  updateColumn(@Req() r: Ctx, @Param("id") id: string, @Param("columnId") columnId: string, @Body(new ZodPipe(columnPatchDto)) b: z.infer<typeof columnPatchDto>) { return this.svc.updateColumn(r.organizationId, id, columnId, b); }
  @Delete("portfolios/:id/columns/:columnId") @RequirePermission(CAPABILITIES.PORTFOLIO_MANAGE)
  removeColumn(@Req() r: Ctx, @Param("id") id: string, @Param("columnId") columnId: string) { return this.svc.removeColumn(r.organizationId, id, columnId); }

  @Post("portfolios/:id/initiatives") @RequirePermission(CAPABILITIES.PORTFOLIO_MANAGE)
  createInit(@Req() r: Ctx, @Param("id") id: string, @Body(new ZodPipe(initDto)) b: z.infer<typeof initDto>) { return this.svc.createInitiative(r.organizationId, id, b); }
  @Get("portfolios/:id/initiatives") listInit(@Req() r: Ctx, @Param("id") id: string) { return this.svc.listInitiatives(r.organizationId, id); }
  @Post("initiatives/:id/status") @RequirePermission(CAPABILITIES.PORTFOLIO_MANAGE)
  initStatus(@Req() r: Ctx, @Param("id") id: string, @Body(new ZodPipe(statusDto)) b: z.infer<typeof statusDto>) { return this.svc.setInitiativeStatus(r.organizationId, id, b.status); }

  @Post("portfolios/:id/milestones") @RequirePermission(CAPABILITIES.PORTFOLIO_MANAGE)
  createMs(@Req() r: Ctx, @Param("id") id: string, @Body(new ZodPipe(msDto)) b: z.infer<typeof msDto>) { return this.svc.createMilestone(r.organizationId, id, b); }
  @Get("portfolios/:id/milestones") listMs(@Req() r: Ctx, @Param("id") id: string) { return this.svc.listMilestones(r.organizationId, id); }
  @Post("milestones/:id/status") @RequirePermission(CAPABILITIES.PORTFOLIO_MANAGE)
  msStatus(@Req() r: Ctx, @Param("id") id: string, @Body(new ZodPipe(statusDto)) b: z.infer<typeof statusDto>) { return this.svc.setMilestoneStatus(r.organizationId, id, b.status); }
}
