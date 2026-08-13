import { Body, Controller, Delete, Get, Param, Post, Req, UseGuards } from "@nestjs/common";
import { Request } from "express";
import { z } from "zod";
import { ZodPipe } from "../common/zod.pipe.js";
import { SessionGuard } from "../auth/guards/session.guard.js";
import { OrgContextGuard } from "../org-context/org-context.guard.js";
import { AuthzGuard } from "../authz/authz.guard.js";
import { RequirePermission } from "../authz/require-permission.decorator.js";
import { CAPABILITIES } from "../authz/capabilities.js";
import { DataOpsService } from "./data-ops.service.js";
import { BackgroundJobsService } from "../background-jobs/background-jobs.service.js";

type Ctx = Request & { userId: string; organizationId: string };
const retentionDto = z.object({ entity: z.string().optional(), retentionDays: z.number().int().positive(), autoPurge: z.boolean().optional() });

@Controller()
@UseGuards(SessionGuard, OrgContextGuard, AuthzGuard)
export class DataOpsController {
  constructor(private readonly svc: DataOpsService, private readonly jobs: BackgroundJobsService) {}

  @Get("recycle-bin") bin(@Req() r: Ctx) { return this.svc.listRecycleBin(r.organizationId); }
  @Post("recycle-bin/:id/restore") @RequirePermission(CAPABILITIES.ORG_SETTINGS_MANAGE)
  restore(@Req() r: Ctx, @Param("id") id: string) { return this.svc.restore(r.organizationId, id); }
  @Delete("recycle-bin/:id") @RequirePermission(CAPABILITIES.ORG_SETTINGS_MANAGE)
  purge(@Req() r: Ctx, @Param("id") id: string) { return this.svc.permanentDelete(r.organizationId, id); }

  @Get("retention") getRetention(@Req() r: Ctx) { return this.svc.getRetention(r.organizationId); }
  @Post("retention") @RequirePermission(CAPABILITIES.ORG_SETTINGS_MANAGE)
  setRetention(@Req() r: Ctx, @Body(new ZodPipe(retentionDto)) b: z.infer<typeof retentionDto>) { return this.svc.setRetention(r.organizationId, b); }
  @Post("retention/purge") @RequirePermission(CAPABILITIES.ORG_SETTINGS_MANAGE)
  purgeExpired(@Req() r: Ctx) { return this.svc.purgeExpired(r.organizationId); }
  @Post("retention/purge-async") @RequirePermission(CAPABILITIES.ORG_SETTINGS_MANAGE)
  purgeExpiredAsync(@Req() r: Ctx) { return this.jobs.enqueueRetentionPurge(r.organizationId, r.userId); }

  @Get("export") @RequirePermission(CAPABILITIES.DATA_PORTABILITY)
  exportOrg(@Req() r: Ctx) { return this.svc.exportOrg(r.organizationId); }
}
