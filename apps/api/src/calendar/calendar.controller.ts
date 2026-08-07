import { Body, Controller, Get, Header, Param, Post, Query, Req, UseGuards } from "@nestjs/common";
import { Request } from "express";
import { z } from "zod";
import { ZodPipe } from "../common/zod.pipe.js";
import { SessionGuard } from "../auth/guards/session.guard.js";
import { OrgContextGuard } from "../org-context/org-context.guard.js";
import { AuthzGuard } from "../authz/authz.guard.js";
import { RequirePermission } from "../authz/require-permission.decorator.js";
import { CAPABILITIES } from "../authz/capabilities.js";
import { CalendarService } from "./calendar.service.js";
import { CalendarViewService } from "./calendar-view.service.js";

type Ctx = Request & { userId: string; organizationId: string };
const calDto = z.object({ name: z.string().min(1), workingDays: z.array(z.number().int().min(0).max(6)).optional(), timezone: z.string().optional(), isDefault: z.boolean().optional() });
const holDto = z.object({ date: z.string(), name: z.string().min(1) });

@Controller()
@UseGuards(SessionGuard, OrgContextGuard, AuthzGuard)
export class CalendarController {
  constructor(private readonly cal: CalendarService, private readonly view: CalendarViewService) {}

  @Get("calendars")
  list(@Req() r: Ctx) { return this.cal.list(r.organizationId); }
  @Post("calendars") @RequirePermission(CAPABILITIES.CALENDAR_MANAGE)
  create(@Req() r: Ctx, @Body(new ZodPipe(calDto)) b: z.infer<typeof calDto>) { return this.cal.createCalendar(r.organizationId, r.userId, b); }
  @Post("calendars/:id/holidays") @RequirePermission(CAPABILITIES.CALENDAR_MANAGE)
  holiday(@Req() r: Ctx, @Param("id") id: string, @Body(new ZodPipe(holDto)) b: z.infer<typeof holDto>) { return this.cal.addHoliday(r.organizationId, id, b.date, b.name).then(() => ({ ok: true })); }
  @Get("calendars/:id/working-days")
  workingDays(@Req() r: Ctx, @Param("id") id: string, @Query("start") start: string, @Query("end") end: string) { return this.cal.workingDaysBetween(r.organizationId, id, start, end).then((count) => ({ count })); }

  @Get("calendar/range")
  range(@Req() r: Ctx, @Query("from") from: string, @Query("to") to: string, @Query("projectId") projectId?: string, @Query("mine") mine?: string) {
    return this.view.range(r.organizationId, r.userId, { projectId, mine: mine === "true" }, from, to);
  }

  @Get("calendar/export.ics") @Header("Content-Type", "text/calendar; charset=utf-8")
  ics(@Req() r: Ctx, @Query("from") from: string, @Query("to") to: string, @Query("projectId") projectId?: string, @Query("mine") mine?: string) {
    return this.view.ics(r.organizationId, r.userId, { projectId, mine: mine === "true" }, from, to);
  }
}
