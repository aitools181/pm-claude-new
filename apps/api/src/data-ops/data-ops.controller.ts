import { Body, Controller, Delete, Get, Param, Post, Query, Req, UseGuards } from "@nestjs/common";
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

  // ---- X01 Trash Centre ----
  @Get("trash")
  trash(@Req() r: Ctx, @Query("scope") scope?: string, @Query("projectId") projectId?: string, @Query("deleterId") deleterId?: string) {
    const s = scope === "mine" || scope === "org" ? scope : "project";
    return this.svc.listTrash(r.organizationId, r.userId, s as "mine" | "project" | "org", { projectId, deleterId });
  }
  @Get("work-items/:id/delete-impact")
  deleteImpact(@Req() r: Ctx, @Param("id") id: string) { return this.svc.deleteImpact(r.organizationId, id); }
  @Post("work-items/:id/soft-delete") @RequirePermission(CAPABILITIES.WORKITEM_DELETE)
  softDelete(@Req() r: Ctx, @Param("id") id: string, @Body(new ZodPipe(z.object({ reason: z.string().trim().max(500).optional(), source: z.string().max(30).optional() }))) b: { reason?: string; source?: string }) {
    return this.svc.softDelete(r.organizationId, r.userId, id, b);
  }
  @Post("trash/:id/restore") @RequirePermission(CAPABILITIES.WORKITEM_DELETE)
  restoreCascade(@Req() r: Ctx, @Param("id") id: string) { return this.svc.restoreWithCascade(r.organizationId, id); }
  @Post("trash/bulk-restore") @RequirePermission(CAPABILITIES.WORKITEM_DELETE)
  bulkRestore(@Req() r: Ctx, @Body(new ZodPipe(z.object({ ids: z.array(z.string().uuid()).min(1).max(200) }))) b: { ids: string[] }) {
    return this.svc.bulkRestore(r.organizationId, b.ids);
  }

  // ---- X01.4 Undo/Redo ----
  @Get("undo-stack") undoStack(@Req() r: Ctx) { return this.svc.undoStack(r.organizationId, r.userId); }
  @Post("undo") undo(@Req() r: Ctx) { return this.svc.undoLast(r.organizationId, r.userId); }
  @Post("redo") redo(@Req() r: Ctx) { return this.svc.redoLast(r.organizationId, r.userId); }

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
