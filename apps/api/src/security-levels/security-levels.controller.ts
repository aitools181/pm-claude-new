import { Body, Controller, Delete, Get, Param, Post, Req, UseGuards } from "@nestjs/common";
import { Request } from "express";
import { z } from "zod";
import { ZodPipe } from "../common/zod.pipe.js";
import { SessionGuard } from "../auth/guards/session.guard.js";
import { OrgContextGuard } from "../org-context/org-context.guard.js";
import { AuthzGuard } from "../authz/authz.guard.js";
import { RequirePermission } from "../authz/require-permission.decorator.js";
import { CAPABILITIES } from "../authz/capabilities.js";
import { SecurityLevelsService } from "./security-levels.service.js";

type Ctx = Request & { userId: string; organizationId: string };

@Controller()
@UseGuards(SessionGuard, OrgContextGuard, AuthzGuard)
export class SecurityLevelsController {
  constructor(private readonly svc: SecurityLevelsService) {}

  @Get("projects/:projectId/security-levels")
  list(@Req() r: Ctx, @Param("projectId") projectId: string) { return this.svc.list(r.organizationId, projectId); }

  @Post("projects/:projectId/security-levels") @RequirePermission(CAPABILITIES.PROJECT_MANAGE)
  create(@Req() r: Ctx, @Param("projectId") projectId: string, @Body(new ZodPipe(z.object({ name: z.string().trim().min(1).max(100), rank: z.number().int().optional() }))) b: { name: string; rank?: number }) {
    return this.svc.create(r.organizationId, projectId, b);
  }

  @Post("security-levels/:id/rename") @RequirePermission(CAPABILITIES.PROJECT_MANAGE)
  rename(@Req() r: Ctx, @Param("id") id: string, @Body(new ZodPipe(z.object({ name: z.string().trim().min(1).max(100) }))) b: { name: string }) {
    return this.svc.rename(r.organizationId, id, b.name);
  }

  @Delete("security-levels/:id") @RequirePermission(CAPABILITIES.PROJECT_MANAGE)
  remove(@Req() r: Ctx, @Param("id") id: string) { return this.svc.remove(r.organizationId, id); }

  @Post("security-levels/:id/grants") @RequirePermission(CAPABILITIES.PROJECT_MANAGE)
  addGrant(@Req() r: Ctx, @Param("id") id: string, @Body(new ZodPipe(z.object({ granteeType: z.enum(["user", "role"]), userId: z.string().uuid().optional(), roleKey: z.string().max(80).optional() }))) b: { granteeType: "user" | "role"; userId?: string; roleKey?: string }) {
    return this.svc.addGrant(r.organizationId, id, b);
  }

  @Delete("security-levels/grants/:grantId") @RequirePermission(CAPABILITIES.PROJECT_MANAGE)
  removeGrant(@Req() r: Ctx, @Param("grantId") grantId: string) { return this.svc.removeGrant(r.organizationId, grantId); }

  @Post("work-items/:id/security-level") @RequirePermission(CAPABILITIES.WORKITEM_EDIT)
  assign(@Req() r: Ctx, @Param("id") id: string, @Body(new ZodPipe(z.object({ securityLevelId: z.string().uuid().nullable() }))) b: { securityLevelId: string | null }) {
    return this.svc.assignToWorkItem(r.organizationId, id, b.securityLevelId);
  }
}
