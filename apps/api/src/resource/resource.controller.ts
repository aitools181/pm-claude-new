import { Body, Controller, Delete, Get, Param, Post, Put, Query, Req, UseGuards } from "@nestjs/common";
import { Request } from "express";
import { z } from "zod";
import { ZodPipe } from "../common/zod.pipe.js";
import { SessionGuard } from "../auth/guards/session.guard.js";
import { OrgContextGuard } from "../org-context/org-context.guard.js";
import { AuthzGuard } from "../authz/authz.guard.js";
import { RequirePermission } from "../authz/require-permission.decorator.js";
import { CAPABILITIES } from "../authz/capabilities.js";
import { ResourceService } from "./resource.service.js";

type Ctx = Request & { userId: string; organizationId: string };
const range = (q: any) => ({ from: String(q.from), to: String(q.to) });
const profileDto = z.object({ hoursPerDay: z.number().int().min(1).max(24), workingDays: z.array(z.number().int().min(1).max(7)).nullable().optional(), effectiveFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(), effectiveTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional() });
const skillsDto = z.object({ skills: z.array(z.object({ skill: z.string().trim().min(1).max(80), level: z.number().int().min(1).max(5) })).max(50) });
const leaveDto = z.object({ startDate: z.string(), endDate: z.string(), type: z.string().optional(), note: z.string().optional() });
const statusDto = z.object({ status: z.enum(["pending", "approved", "cancelled"]) });
const allocDto = z.object({ userId: z.string().uuid(), projectId: z.string().uuid(), startDate: z.string(), endDate: z.string(), percent: z.number().int().min(0).max(100).optional(), note: z.string().optional() });

@Controller()
@UseGuards(SessionGuard, OrgContextGuard, AuthzGuard)
export class ResourceController {
  constructor(private readonly svc: ResourceService) {}

  // workload
  @Get("me/workload") myWorkload(@Req() r: Ctx, @Query() q: any) { const { from, to } = range(q); return this.svc.workload(r.organizationId, r.userId, from, to); }
  @Get("workload/team") @RequirePermission(CAPABILITIES.RESOURCE_MANAGE)
  team(@Req() r: Ctx, @Query() q: any) { const { from, to } = range(q); return this.svc.team(r.organizationId, from, to); }
  @Get("users/:id/workload") @RequirePermission(CAPABILITIES.RESOURCE_MANAGE)
  userWorkload(@Req() r: Ctx, @Param("id") id: string, @Query() q: any) { const { from, to } = range(q); return this.svc.workload(r.organizationId, id, from, to); }

  // profile
  @Get("me/capacity-profile") myProfile(@Req() r: Ctx) { return this.svc.getProfile(r.organizationId, r.userId); }
  @Put("users/:id/capacity-profile") @RequirePermission(CAPABILITIES.RESOURCE_MANAGE)
  setProfile(@Req() r: Ctx, @Param("id") id: string, @Body(new ZodPipe(profileDto)) b: z.infer<typeof profileDto>) { return this.svc.addProfilePeriod(r.organizationId, id, b); }
  @Get("users/:id/capacity-profile/history") @RequirePermission(CAPABILITIES.RESOURCE_MANAGE)
  profileHistory(@Req() r: Ctx, @Param("id") id: string) { return this.svc.profileHistory(r.organizationId, id); }
  @Delete("users/:id/capacity-profile/:profileId") @RequirePermission(CAPABILITIES.RESOURCE_MANAGE)
  removeProfilePeriod(@Req() r: Ctx, @Param("id") id: string, @Param("profileId") profileId: string) { return this.svc.removeProfilePeriod(r.organizationId, id, profileId); }

  // leave
  @Post("leave") requestLeave(@Req() r: Ctx, @Body(new ZodPipe(leaveDto)) b: z.infer<typeof leaveDto>) { return this.svc.createLeave(r.organizationId, r.userId, b); }
  @Get("me/leave") myLeave(@Req() r: Ctx) { return this.svc.listLeave(r.organizationId, r.userId); }
  @Post("leave/:id/status") @RequirePermission(CAPABILITIES.RESOURCE_MANAGE)
  leaveStatus(@Req() r: Ctx, @Param("id") id: string, @Body(new ZodPipe(statusDto)) b: z.infer<typeof statusDto>) { return this.svc.setLeaveStatus(r.organizationId, id, b.status); }

  // allocation
  @Post("allocations") @RequirePermission(CAPABILITIES.RESOURCE_MANAGE)
  allocate(@Req() r: Ctx, @Body(new ZodPipe(allocDto)) b: z.infer<typeof allocDto>) { return this.svc.createAllocation(r.organizationId, b); }
  @Get("users/:id/allocations") @RequirePermission(CAPABILITIES.RESOURCE_MANAGE)
  allocations(@Req() r: Ctx, @Param("id") id: string) { return this.svc.listAllocations(r.organizationId, id); }
  @Delete("allocations/:id") @RequirePermission(CAPABILITIES.RESOURCE_MANAGE)
  removeAllocation(@Req() r: Ctx, @Param("id") id: string) { return this.svc.deleteAllocation(r.organizationId, id); }

  // ---- F16 skills ----
  @Get("me/skills") mySkills(@Req() r: Ctx) { return this.svc.mySkills(r.organizationId, r.userId); }
  @Put("me/skills") setMySkills(@Req() r: Ctx, @Body(new ZodPipe(skillsDto)) b: { skills: { skill: string; level: number }[] }) { return this.svc.setSkills(r.organizationId, r.userId, r.userId, b.skills); }
  @Get("skills/matrix") @RequirePermission(CAPABILITIES.RESOURCE_MANAGE) skillsMatrix(@Req() r: Ctx) { return this.svc.skillsMatrix(r.organizationId); }
  @Put("users/:id/skills") @RequirePermission(CAPABILITIES.RESOURCE_MANAGE) setUserSkills(@Req() r: Ctx, @Param("id") id: string, @Body(new ZodPipe(skillsDto)) b: { skills: { skill: string; level: number }[] }) { return this.svc.setSkills(r.organizationId, r.userId, id, b.skills); }
  @Get("skills/suggest") @RequirePermission(CAPABILITIES.RESOURCE_MANAGE) suggest(@Req() r: Ctx, @Query("skill") skill: string) { return this.svc.suggestAssignees(r.organizationId, skill ?? ""); }
}
