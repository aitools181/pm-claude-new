import { Body, Controller, Delete, Get, Param, Post, Put, Query, Req, UseGuards } from "@nestjs/common";
import { Request } from "express";
import { z } from "zod";
import { ZodPipe } from "../common/zod.pipe.js";
import { SessionGuard } from "../auth/guards/session.guard.js";
import { OrgContextGuard } from "../org-context/org-context.guard.js";
import { AuthzGuard } from "../authz/authz.guard.js";
import { RequirePermission } from "../authz/require-permission.decorator.js";
import { CAPABILITIES } from "../authz/capabilities.js";
import { RolesService } from "./roles.service.js";

type Ctx = Request & { userId: string; organizationId: string };
const createRole = z.object({ key: z.string().min(1), name: z.string().min(1), permissions: z.array(z.string()).default([]) });
const setPerms = z.object({ permissions: z.array(z.string()) });
const assign = z.object({ targetUserId: z.string().uuid(), roleKey: z.string().min(1), scopeType: z.enum(["organization", "project"]).optional(), scopeId: z.string().uuid().optional() });

@Controller("roles")
@UseGuards(SessionGuard, OrgContextGuard, AuthzGuard)
export class RolesController {
  constructor(private readonly roles: RolesService) {}

  @Get("capabilities")
  capabilities() { return { capabilities: Object.values(CAPABILITIES) }; }

  @Get()
  list(@Req() r: Ctx) { return this.roles.list(r.organizationId); }

  @Post() @RequirePermission(CAPABILITIES.ROLES_MANAGE)
  create(@Req() r: Ctx, @Body(new ZodPipe(createRole)) b: z.infer<typeof createRole>) { return this.roles.create(r.organizationId, r.userId, b); }

  @Put(":roleId/permissions") @RequirePermission(CAPABILITIES.ROLES_MANAGE)
  setPerms(@Req() r: Ctx, @Param("roleId") id: string, @Body(new ZodPipe(setPerms)) b: { permissions: string[] }) {
    return this.roles.setPermissions(r.organizationId, r.userId, id, b.permissions).then(() => ({ ok: true }));
  }

  @Post("assignments") @RequirePermission(CAPABILITIES.ROLES_ASSIGN)
  assign(@Req() r: Ctx, @Body(new ZodPipe(assign)) b: z.infer<typeof assign>) { return this.roles.assign(r.organizationId, r.userId, b).then(() => ({ ok: true })); }

  @Delete("assignments/:assignmentId") @RequirePermission(CAPABILITIES.ROLES_ASSIGN)
  unassign(@Req() r: Ctx, @Param("assignmentId") id: string) { return this.roles.unassign(r.organizationId, id, r.userId).then(() => ({ ok: true })); }

  /** Permission preview — same resolver the guard uses, so it matches real outcomes. */
  @Get("preview/:targetUserId") @RequirePermission(CAPABILITIES.ROLES_ASSIGN)
  preview(@Req() r: Ctx, @Param("targetUserId") uid: string, @Query("projectId") projectId?: string) {
    return this.roles.preview(r.organizationId, uid, projectId);
  }
}
