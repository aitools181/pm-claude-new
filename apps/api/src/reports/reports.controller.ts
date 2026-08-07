import { Body, Controller, Get, Param, Post, Req, UseGuards } from "@nestjs/common";
import { Request } from "express";
import { z } from "zod";
import { ZodPipe } from "../common/zod.pipe.js";
import { SessionGuard } from "../auth/guards/session.guard.js";
import { OrgContextGuard } from "../org-context/org-context.guard.js";
import { AuthzGuard } from "../authz/authz.guard.js";
import { RequirePermission } from "../authz/require-permission.decorator.js";
import { CAPABILITIES } from "../authz/capabilities.js";
import { ReportService } from "./report.service.js";

type Ctx = Request & { userId: string; organizationId: string };
const defDto = z.object({ name: z.string().min(1), kind: z.enum(["dashboard", "portfolio", "metric"]), refId: z.string().uuid(), format: z.enum(["json", "csv", "html"]).optional(), frequency: z.enum(["daily", "weekly", "monthly"]).optional(), recipients: z.array(z.string()).min(1), nextRunAt: z.string().optional() });

@Controller()
@UseGuards(SessionGuard, OrgContextGuard, AuthzGuard)
export class ReportsController {
  constructor(private readonly svc: ReportService) {}

  @Get("report-definitions") list(@Req() r: Ctx) { return this.svc.listDefinitions(r.organizationId); }
  @Post("report-definitions") @RequirePermission(CAPABILITIES.REPORT_MANAGE)
  create(@Req() r: Ctx, @Body(new ZodPipe(defDto)) b: z.infer<typeof defDto>) { return this.svc.createDefinition(r.organizationId, r.userId, b); }
  @Post("report-definitions/:id/run") @RequirePermission(CAPABILITIES.REPORT_MANAGE)
  run(@Req() r: Ctx, @Param("id") id: string) { return this.svc.runNow(r.organizationId, id); }
  @Get("report-definitions/:id/history") history(@Req() r: Ctx, @Param("id") id: string) { return this.svc.history(r.organizationId, id); }

  @Post("report-runs/:id/retry") @RequirePermission(CAPABILITIES.REPORT_MANAGE)
  retry(@Req() r: Ctx, @Param("id") id: string) { return this.svc.retry(r.organizationId, id); }
  @Get("report-runs/:id/deliveries") deliveries(@Req() r: Ctx, @Param("id") id: string) { return this.svc.deliveries(r.organizationId, id); }

  @Post("reports/run-due") @RequirePermission(CAPABILITIES.REPORT_MANAGE)
  runDue(@Req() r: Ctx) { return this.svc.runDue(r.organizationId); }
  @Post("reports/retry-due") @RequirePermission(CAPABILITIES.REPORT_MANAGE)
  retryDue(@Req() r: Ctx) { return this.svc.retryDue(r.organizationId); }
}
