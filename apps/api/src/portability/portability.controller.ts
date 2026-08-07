import { Body, Controller, Get, Param, Post, Req, UseGuards } from "@nestjs/common";
import { Request } from "express";
import { z } from "zod";
import { ZodPipe } from "../common/zod.pipe.js";
import { SessionGuard } from "../auth/guards/session.guard.js";
import { OrgContextGuard } from "../org-context/org-context.guard.js";
import { AuthzGuard } from "../authz/authz.guard.js";
import { RequirePermission } from "../authz/require-permission.decorator.js";
import { CAPABILITIES } from "../authz/capabilities.js";
import { ImportService, parseCsv } from "./import.service.js";
import { ExportService } from "./export.service.js";

type Ctx = Request & { userId: string; organizationId: string };
const dry = z.object({ rows: z.array(z.record(z.any())).optional(), csv: z.string().optional(), mapping: z.record(z.string()) });
const run = dry.extend({ projectId: z.string().uuid() });

@Controller()
@UseGuards(SessionGuard, OrgContextGuard, AuthzGuard)
export class PortabilityController {
  constructor(private readonly imp: ImportService, private readonly exp: ExportService) {}

  @Post("import/dry-run") @RequirePermission(CAPABILITIES.DATA_PORTABILITY)
  dryRun(@Req() r: Ctx, @Body(new ZodPipe(dry)) b: z.infer<typeof dry>) {
    const rows = b.rows ?? (b.csv ? parseCsv(b.csv) : []);
    return this.imp.dryRun(r.organizationId, rows, b.mapping);
  }
  @Post("import/run") @RequirePermission(CAPABILITIES.DATA_PORTABILITY)
  run(@Req() r: Ctx, @Body(new ZodPipe(run)) b: z.infer<typeof run>) {
    const rows = b.rows ?? (b.csv ? parseCsv(b.csv) : []);
    return this.imp.run(r.organizationId, r.userId, b.projectId, rows, b.mapping);
  }
  @Post("export/project/:projectId") @RequirePermission(CAPABILITIES.DATA_PORTABILITY)
  exportProject(@Req() r: Ctx, @Param("projectId") id: string) { return this.exp.exportProject(r.organizationId, id); }
  @Get("export/jobs") @RequirePermission(CAPABILITIES.DATA_PORTABILITY)
  jobs(@Req() r: Ctx) { return this.exp.list(r.organizationId); }
}
