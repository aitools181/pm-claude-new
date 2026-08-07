import { Body, Controller, Delete, Get, Param, Post, Req, UseGuards } from "@nestjs/common";
import { Request } from "express";
import { z } from "zod";
import { ZodPipe } from "../common/zod.pipe.js";
import { SessionGuard } from "../auth/guards/session.guard.js";
import { OrgContextGuard } from "../org-context/org-context.guard.js";
import { AuthzGuard } from "../authz/authz.guard.js";
import { RequirePermission } from "../authz/require-permission.decorator.js";
import { CAPABILITIES } from "../authz/capabilities.js";
import { DependenciesService } from "./dependencies.service.js";

type Ctx = Request & { userId: string; organizationId: string };
const addDto = z.object({ predecessorId: z.string().uuid(), successorId: z.string().uuid(), type: z.enum(["finish_to_start", "start_to_start", "finish_to_finish"]).optional() });

@Controller()
@UseGuards(SessionGuard, OrgContextGuard, AuthzGuard)
export class DependenciesController {
  constructor(private readonly deps: DependenciesService) {}

  @Post("dependencies") @RequirePermission(CAPABILITIES.DEPENDENCY_MANAGE)
  add(@Req() r: Ctx, @Body(new ZodPipe(addDto)) b: z.infer<typeof addDto>) { return this.deps.add(r.organizationId, r.userId, b.predecessorId, b.successorId, b.type); }

  @Delete("dependencies/:id") @RequirePermission(CAPABILITIES.DEPENDENCY_MANAGE)
  remove(@Req() r: Ctx, @Param("id") id: string) { return this.deps.remove(r.organizationId, id).then(() => ({ ok: true })); }

  @Get("work-items/:id/dependencies")
  list(@Req() r: Ctx, @Param("id") id: string) { return this.deps.listForItem(r.organizationId, id); }

  @Get("work-items/:id/blocked")
  blocked(@Req() r: Ctx, @Param("id") id: string) { return this.deps.isBlocked(r.organizationId, id).then((blocked) => ({ blocked })); }

  @Get("projects/:id/dependency-graph")
  graph(@Req() r: Ctx, @Param("id") id: string) { return this.deps.graph(r.organizationId, r.userId, id); }

  @Get("projects/:id/dependency-conflicts")
  conflicts(@Req() r: Ctx, @Param("id") id: string) { return this.deps.conflicts(r.organizationId, id); }
}
