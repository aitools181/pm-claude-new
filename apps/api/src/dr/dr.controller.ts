import { Body, Controller, Get, Param, Post, Query, UseGuards } from "@nestjs/common";
import { z } from "zod";
import { ZodPipe } from "../common/zod.pipe.js";
import { SessionGuard } from "../auth/guards/session.guard.js";
import { OrgContextGuard } from "../org-context/org-context.guard.js";
import { AuthzGuard } from "../authz/authz.guard.js";
import { RequirePermission } from "../authz/require-permission.decorator.js";
import { CAPABILITIES } from "../authz/capabilities.js";
import { DrService } from "./dr.service.js";

const providedSchema = z.object({ kind: z.string(), sha256: z.string() });
const drillDto = z.object({
  backupRunId: z.string().uuid(),
  target: z.enum(["fresh", "off_server", "isolated"]).optional(),
  provided: z.array(providedSchema),
  reconciliation: z.record(z.object({ expected: z.number().int(), actual: z.number().int() })),
  appStarted: z.boolean().optional(),
  rtoSeconds: z.number().int().nonnegative().optional(),
  scheduledLabel: z.string().optional(),
});
const verifyDto = z.object({ backupRunId: z.string().uuid(), provided: z.array(providedSchema) });

@Controller("dr")
@UseGuards(SessionGuard, OrgContextGuard, AuthzGuard)
export class DrController {
  constructor(private readonly svc: DrService) {}

  @Post("verify-checksums") @RequirePermission(CAPABILITIES.BACKUP_MANAGE)
  verify(@Body(new ZodPipe(verifyDto)) b: z.infer<typeof verifyDto>) { return this.svc.verifyChecksums(b.backupRunId, b.provided); }
  @Post("drills") @RequirePermission(CAPABILITIES.BACKUP_RESTORE)
  runDrill(@Body(new ZodPipe(drillDto)) b: z.infer<typeof drillDto>) { return this.svc.runDrill(b); }
  @Get("drills") list(@Query("backupRunId") backupRunId?: string) { return this.svc.listDrills(backupRunId); }
  @Get("recovery-evidence") evidence() { return this.svc.recoveryEvidence(); }
}
