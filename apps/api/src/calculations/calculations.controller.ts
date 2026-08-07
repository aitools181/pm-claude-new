import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from "@nestjs/common";
import { Request } from "express";
import { z } from "zod";
import { SessionGuard } from "../auth/guards/session.guard.js";
import { OrgContextGuard } from "../org-context/org-context.guard.js";
import { AuthzGuard } from "../authz/authz.guard.js";
import { RequirePermission } from "../authz/require-permission.decorator.js";
import { CAPABILITIES } from "../authz/capabilities.js";
import { ZodPipe } from "../common/zod.pipe.js";
import { CalculationsService } from "./calculations.service.js";

type Ctx = Request & { userId: string; organizationId: string };
const pathDto = z.object({ key: z.string().min(1), name: z.string().min(1), pathKind: z.enum(["children", "parent", "dependency", "placement", "custom_relation"]), sourceType: z.string().optional(), targetType: z.string().optional(), config: z.record(z.unknown()).optional() });
const definitionDto = z.object({ targetFieldId: z.string().uuid(), relationPathId: z.string().uuid().optional(), kind: z.enum(["lookup", "mirror", "rollup"]), sourceFieldKey: z.string().min(1), operation: z.enum(["count", "count_distinct", "sum", "average", "min", "max", "earliest", "latest", "percent_complete", "status_distribution"]).optional(), filter: z.record(z.unknown()).optional(), config: z.record(z.unknown()).optional(), dependsOnCalculationIds: z.array(z.string().uuid()).optional() });
const calculateDto = z.object({ workItemId: z.string().uuid() });

@Controller("calculations")
@UseGuards(SessionGuard, OrgContextGuard, AuthzGuard)
export class CalculationsController {
  constructor(private readonly service: CalculationsService) {}
  @Get() list(@Req() r: Ctx) { return this.service.list(r.organizationId); }
  @Post("paths") @RequirePermission(CAPABILITIES.CALCULATION_MANAGE) createPath(@Req() r: Ctx, @Body(new ZodPipe(pathDto)) b: z.infer<typeof pathDto>) { return this.service.createPath(r.organizationId, b); }
  @Post("definitions") @RequirePermission(CAPABILITIES.CALCULATION_MANAGE) createDefinition(@Req() r: Ctx, @Body(new ZodPipe(definitionDto)) b: z.infer<typeof definitionDto>) { return this.service.createDefinition(r.organizationId, r.userId, b); }
  @Post(":id/calculate") calculate(@Req() r: Ctx, @Param("id") id: string, @Body(new ZodPipe(calculateDto)) b: z.infer<typeof calculateDto>) { return this.service.calculate(r.organizationId, r.userId, id, b.workItemId); }
  @Post(":id/recalculate") @RequirePermission(CAPABILITIES.CALCULATION_MANAGE) recalculate(@Req() r: Ctx, @Param("id") id: string, @Query("projectId") projectId?: string) { return this.service.recalculate(r.organizationId, r.userId, id, projectId); }
}
