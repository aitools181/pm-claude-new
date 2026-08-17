import { Body, Controller, Get, Inject, Param, Post, Req, UseGuards } from "@nestjs/common";
import { Request } from "express";
import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { schema, type Database } from "@pm/db";
import { DB } from "../db/db.module.js";
import { ZodPipe } from "../common/zod.pipe.js";
import { SessionGuard } from "../auth/guards/session.guard.js";
import { OrgContextGuard } from "../org-context/org-context.guard.js";
import { AuthzGuard } from "../authz/authz.guard.js";
import { RequirePermission } from "../authz/require-permission.decorator.js";
import { CAPABILITIES } from "../authz/capabilities.js";
import { MaintenanceModeService } from "./maintenance-mode.service.js";
import { BackupScheduleService } from "./backup-schedule.service.js";
import { RestoreOrchestrator } from "./restore.orchestrator.js";
import { IntegrityService } from "./integrity.service.js";

type Ctx = Request & { userId: string; organizationId: string };
const enterDto = z.object({ reason: z.string().min(1) });
const schedDto = z.object({ name: z.string().min(1), intervalMinutes: z.number().int().positive(), timezone: z.string().optional(), retentionDays: z.number().int().positive().optional(), firstRunAt: z.string() });
const restoreDto = z.object({ backupRunId: z.string().uuid(), manifestPath: z.string(), requestedTargetDatabase: z.string().min(1), requestedObjectNamespace: z.string().min(1) });

@Controller("maintenance")
@UseGuards(SessionGuard, OrgContextGuard, AuthzGuard)
export class MaintenanceController {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly maintenance: MaintenanceModeService,
    private readonly schedules: BackupScheduleService,
    private readonly restore: RestoreOrchestrator,
    private readonly integrity: IntegrityService,
  ) {}

  @Get("status") @RequirePermission(CAPABILITIES.BACKUP_MANAGE)
  status() { return this.maintenance.status(); }

  @Post("enter") @RequirePermission(CAPABILITIES.BACKUP_MANAGE)
  enter(@Req() r: Ctx, @Body(new ZodPipe(enterDto)) b: { reason: string }) { return this.maintenance.enter(b.reason, r.userId).then(() => ({ ok: true })); }

  @Post("exit") @RequirePermission(CAPABILITIES.BACKUP_MANAGE)
  exit() { return this.maintenance.exit().then(() => ({ ok: true })); }

  @Get("backup-schedules") @RequirePermission(CAPABILITIES.BACKUP_MANAGE)
  listSchedules() { return this.schedules.listSchedules(); }
  @Post("backup-schedules") @RequirePermission(CAPABILITIES.BACKUP_MANAGE)
  createSchedule(@Body(new ZodPipe(schedDto)) b: z.infer<typeof schedDto>) { return this.schedules.createSchedule(b); }
  @Post("backup-schedules/tick") @RequirePermission(CAPABILITIES.BACKUP_MANAGE)
  tick() { return this.schedules.tick(new Date()); }
  @Post("backups/:id/verify") @RequirePermission(CAPABILITIES.BACKUP_MANAGE)
  verify(@Param("id") id: string) { return this.schedules.verify(id, true); }
  @Get("alerts") @RequirePermission(CAPABILITIES.BACKUP_MANAGE)
  alerts() { return this.schedules.listAlerts(); }

  @Get("backups") @RequirePermission(CAPABILITIES.BACKUP_MANAGE)
  backups() { return this.schedules.listBackups(); }

  @Get("restore") @RequirePermission(CAPABILITIES.BACKUP_RESTORE)
  restoreRuns() { return this.db.select().from(schema.restoreRuns).orderBy(desc(schema.restoreRuns.startedAt)).limit(50); }

  /** Records a restore REQUEST. Execution runs out-of-process (Maintenance CLI). */
  @Post("restore/request") @RequirePermission(CAPABILITIES.BACKUP_RESTORE)
  requestRestore(@Req() r: Ctx, @Body(new ZodPipe(restoreDto)) b: z.infer<typeof restoreDto>) {
    return this.restore.createRequest({
      backupRunId: b.backupRunId, manifestPath: b.manifestPath,
      requestedTargetDatabase: b.requestedTargetDatabase, requestedObjectNamespace: b.requestedObjectNamespace,
      primaryDatabase: process.env.PRIMARY_DATABASE ?? "primary", primaryObjectNamespace: process.env.PRIMARY_OBJECT_NAMESPACE ?? "primary",
    }, r.userId);
  }

  @Get("restore/:id") @RequirePermission(CAPABILITIES.BACKUP_RESTORE)
  async restoreStatus(@Param("id") id: string) {
    const [rr] = await this.db.select().from(schema.restoreRuns).where(eq(schema.restoreRuns.id, id)).limit(1);
    return rr ?? null;
  }

  // ---- X04.2/X04.3 data integrity + repair ----
  @Get("integrity/scan") @RequirePermission(CAPABILITIES.BACKUP_MANAGE)
  integrityScan(@Req() r: Ctx) { return this.integrity.scan(r.organizationId); }

  @Post("integrity/:checkId/preview") @RequirePermission(CAPABILITIES.BACKUP_MANAGE)
  integrityPreview(@Req() r: Ctx, @Param("checkId") checkId: string) { return this.integrity.previewRepair(r.organizationId, checkId); }

  @Post("integrity/:checkId/repair") @RequirePermission(CAPABILITIES.BACKUP_MANAGE)
  integrityRepair(@Req() r: Ctx, @Param("checkId") checkId: string, @Body(new ZodPipe(z.object({ reason: z.string().trim().min(5).max(500) }))) b: { reason: string }) {
    return this.integrity.applyRepair(r.organizationId, r.userId, checkId, b.reason);
  }
}
