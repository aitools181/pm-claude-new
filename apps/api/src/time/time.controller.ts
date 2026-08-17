import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UseGuards } from "@nestjs/common";
import { Request } from "express";
import { z } from "zod";
import { ZodPipe } from "../common/zod.pipe.js";
import { SessionGuard } from "../auth/guards/session.guard.js";
import { OrgContextGuard } from "../org-context/org-context.guard.js";
import { AuthzGuard } from "../authz/authz.guard.js";
import { RequirePermission } from "../authz/require-permission.decorator.js";
import { CAPABILITIES } from "../authz/capabilities.js";
import { TimerService } from "./timer.service.js";
import { TimeEntriesService } from "./time-entries.service.js";
import { TimesheetService } from "./timesheet.service.js";
import { TimeReportsService } from "./time-reports.service.js";

type Ctx = Request & { userId: string; organizationId: string };
const today = () => new Date().toISOString().slice(0, 10);

const startDto = z.object({ workItemId: z.string().uuid().optional(), projectId: z.string().uuid().optional(), description: z.string().optional() });
const entryDto = z.object({ date: z.string(), minutes: z.number().int().positive(), workItemId: z.string().uuid().optional(), projectId: z.string().uuid().optional(), description: z.string().optional(), billable: z.boolean().optional() });
const entryPatch = z.object({ minutes: z.number().int().positive().optional(), date: z.string().optional(), description: z.string().optional(), billable: z.boolean().optional() });
const decideDto = z.object({ userId: z.string().uuid(), week: z.string(), note: z.string().optional() });

@Controller()
@UseGuards(SessionGuard, OrgContextGuard, AuthzGuard)
export class TimeController {
  constructor(private timer: TimerService, private entries: TimeEntriesService, private sheets: TimesheetService, private reports: TimeReportsService) {}

  // ---- Timer ----
  @Get("timer") current(@Req() r: Ctx) { return this.timer.current(r.organizationId, r.userId); }
  @Post("timer/start") @RequirePermission(CAPABILITIES.TIME_LOG)
  start(@Req() r: Ctx, @Body(new ZodPipe(startDto)) b: z.infer<typeof startDto>) { return this.timer.start(r.organizationId, r.userId, b); }
  @Post("timer/stop") @RequirePermission(CAPABILITIES.TIME_LOG)
  stop(@Req() r: Ctx) { return this.timer.stop(r.organizationId, r.userId); }
  @Post("timer/discard") discard(@Req() r: Ctx) { return this.timer.discard(r.organizationId, r.userId); }

  // ---- Time entries ----
  @Post("time-entries") @RequirePermission(CAPABILITIES.TIME_LOG)
  createEntry(@Req() r: Ctx, @Body(new ZodPipe(entryDto)) b: z.infer<typeof entryDto>) { return this.entries.create(r.organizationId, r.userId, b); }
  @Patch("time-entries/:id") @RequirePermission(CAPABILITIES.TIME_LOG)
  updateEntry(@Req() r: Ctx, @Param("id") id: string, @Body(new ZodPipe(entryPatch)) b: z.infer<typeof entryPatch>) { return this.entries.update(r.organizationId, r.userId, id, b); }
  @Delete("time-entries/:id") deleteEntry(@Req() r: Ctx, @Param("id") id: string) { return this.entries.remove(r.organizationId, r.userId, id); }

  // ---- Timesheet (owner) ----
  @Get("timesheet") mine(@Req() r: Ctx, @Query("week") week?: string) { return this.sheets.summary(r.organizationId, r.userId, week ?? today()); }

  @Get("timesheets/review") @RequirePermission(CAPABILITIES.TIMESHEET_APPROVE)
  review(@Req() r: Ctx, @Query("userId") userId: string, @Query("week") week: string) { return this.sheets.summary(r.organizationId, userId, week); }
  @Post("timesheet/submit") @RequirePermission(CAPABILITIES.TIME_LOG)
  submit(@Req() r: Ctx, @Body() b: { week?: string }) { return this.sheets.submit(r.organizationId, r.userId, b.week ?? today()); }

  // ---- Timesheet (approver) ----
  @Get("timesheets/queue") @RequirePermission(CAPABILITIES.TIMESHEET_APPROVE)
  queue(@Req() r: Ctx) { return this.sheets.queue(r.organizationId); }
  @Post("timesheets/approve") @RequirePermission(CAPABILITIES.TIMESHEET_APPROVE)
  approve(@Req() r: Ctx, @Body(new ZodPipe(decideDto)) b: z.infer<typeof decideDto>) { return this.sheets.approve(r.organizationId, r.userId, b.userId, b.week); }
  @Post("timesheets/reject") @RequirePermission(CAPABILITIES.TIMESHEET_APPROVE)
  reject(@Req() r: Ctx, @Body(new ZodPipe(decideDto)) b: z.infer<typeof decideDto>) { return this.sheets.reject(r.organizationId, r.userId, b.userId, b.week, b.note ?? ""); }
  @Post("timesheets/lock") @RequirePermission(CAPABILITIES.TIMESHEET_APPROVE)
  lock(@Req() r: Ctx, @Body(new ZodPipe(decideDto)) b: z.infer<typeof decideDto>) { return this.sheets.lock(r.organizationId, r.userId, b.userId, b.week); }
  @Post("timesheets/reopen") @RequirePermission(CAPABILITIES.TIMESHEET_APPROVE)
  reopen(@Req() r: Ctx, @Body(new ZodPipe(decideDto)) b: z.infer<typeof decideDto>) { return this.sheets.reopen(r.organizationId, r.userId, b.userId, b.week, b.note); }

  @Post("timesheets/decide-lines") @RequirePermission(CAPABILITIES.TIMESHEET_APPROVE)
  decideLines(@Req() r: Ctx, @Body(new ZodPipe(z.object({
    userId: z.string().uuid(), week: z.string(),
    approveIds: z.array(z.string().uuid()).max(200).optional(),
    rejectIds: z.array(z.string().uuid()).max(200).optional(),
    rejectionReason: z.string().trim().max(500).optional(),
  }))) b: { userId: string; week: string; approveIds?: string[]; rejectIds?: string[]; rejectionReason?: string }) {
    return this.sheets.decideLines(r.organizationId, r.userId, b.userId, b.week, b);
  }

  // ---- Reports ----
  @Get("time-reports") @RequirePermission(CAPABILITIES.TIMESHEET_APPROVE)
  report(@Req() r: Ctx, @Query("from") from: string, @Query("to") to: string, @Query("userId") userId?: string, @Query("projectId") projectId?: string) {
    return this.reports.report(r.organizationId, { from, to, userId, projectId });
  }
}
