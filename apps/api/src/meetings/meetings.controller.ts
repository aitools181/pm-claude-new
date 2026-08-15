import { Body, Controller, Get, Param, Post, Put, Query, Req, UseGuards } from "@nestjs/common";
import { Request } from "express";
import { z } from "zod";
import { ZodPipe } from "../common/zod.pipe.js";
import { SessionGuard } from "../auth/guards/session.guard.js";
import { OrgContextGuard } from "../org-context/org-context.guard.js";
import { AuthzGuard } from "../authz/authz.guard.js";
import { RequirePermission } from "../authz/require-permission.decorator.js";
import { CAPABILITIES } from "../authz/capabilities.js";
import { MeetingService } from "./meeting.service.js";

type Ctx = Request & { userId: string; organizationId: string };
const seriesDto = z.object({ name: z.string().min(1), cadence: z.enum(["adhoc", "daily", "weekly", "monthly"]).optional(), workspaceId: z.string().uuid().optional() });
const meetingDto = z.object({ title: z.string().min(1), seriesId: z.string().uuid().optional(), scheduledAt: z.string().optional() });
const agendaDto = z.object({ title: z.string().min(1), notes: z.string().optional(), presenterUserId: z.string().uuid().optional(), position: z.number().int().optional() });
const notesDto = z.object({ notes: z.string() });
const decisionDto = z.object({ text: z.string().min(1) });
const attendanceDto = z.object({ userId: z.string().uuid(), status: z.enum(["invited", "attended", "absent"]) });
const actionDto = z.object({ title: z.string().min(1), assigneeUserId: z.string().uuid().optional(), dueDate: z.string().optional(), agendaItemId: z.string().uuid().optional() });
const convertDto = z.object({ projectId: z.string().uuid() });
const statusDto = z.object({ status: z.enum(["scheduled", "held", "cancelled"]) });

@Controller()
@UseGuards(SessionGuard, OrgContextGuard, AuthzGuard)
export class MeetingsController {
  constructor(private readonly svc: MeetingService) {}

  @Get("meeting-series") listSeries(@Req() r: Ctx) { return this.svc.listSeries(r.organizationId); }
  @Post("meeting-series") @RequirePermission(CAPABILITIES.MEETING_MANAGE)
  createSeries(@Req() r: Ctx, @Body(new ZodPipe(seriesDto)) b: z.infer<typeof seriesDto>) { return this.svc.createSeries(r.organizationId, r.userId, b); }

  @Get("meetings") list(@Req() r: Ctx, @Query("seriesId") s?: string) { return this.svc.listMeetings(r.organizationId, s); }
  @Post("meetings") @RequirePermission(CAPABILITIES.MEETING_MANAGE)
  create(@Req() r: Ctx, @Body(new ZodPipe(meetingDto)) b: z.infer<typeof meetingDto>) { return this.svc.createMeeting(r.organizationId, b); }
  @Get("meetings/:id") get(@Req() r: Ctx, @Param("id") id: string) { return this.svc.get(r.organizationId, id); }
  @Post("meetings/:id/status") @RequirePermission(CAPABILITIES.MEETING_MANAGE)
  status(@Req() r: Ctx, @Param("id") id: string, @Body(new ZodPipe(statusDto)) b: z.infer<typeof statusDto>) { return this.svc.setStatus(r.organizationId, id, b.status); }
  @Put("meetings/:id/notes") @RequirePermission(CAPABILITIES.MEETING_MANAGE)
  notes(@Req() r: Ctx, @Param("id") id: string, @Body(new ZodPipe(notesDto)) b: z.infer<typeof notesDto>) { return this.svc.updateNotes(r.organizationId, id, b.notes); }

  @Post("meetings/:id/transcript") @RequirePermission(CAPABILITIES.MEETING_MANAGE)
  setTranscript(@Req() r: Ctx, @Param("id") id: string, @Body(new ZodPipe(z.object({ transcript: z.string().max(500_000) }))) b: { transcript: string }) { return this.svc.setTranscript(r.organizationId, id, b.transcript); }
  @Post("meetings/:id/extract-actions") @RequirePermission(CAPABILITIES.MEETING_MANAGE)
  extractActions(@Req() r: Ctx, @Param("id") id: string) { return this.svc.extractActions(r.organizationId, id); }
  @Post("meetings/:id/agenda") @RequirePermission(CAPABILITIES.MEETING_MANAGE)
  agenda(@Req() r: Ctx, @Param("id") id: string, @Body(new ZodPipe(agendaDto)) b: z.infer<typeof agendaDto>) { return this.svc.addAgendaItem(r.organizationId, id, b); }
  @Post("meetings/:id/decisions") @RequirePermission(CAPABILITIES.MEETING_MANAGE)
  decision(@Req() r: Ctx, @Param("id") id: string, @Body(new ZodPipe(decisionDto)) b: z.infer<typeof decisionDto>) { return this.svc.addDecision(r.organizationId, id, r.userId, b.text); }
  @Post("meetings/:id/attendance") @RequirePermission(CAPABILITIES.MEETING_MANAGE)
  attendance(@Req() r: Ctx, @Param("id") id: string, @Body(new ZodPipe(attendanceDto)) b: z.infer<typeof attendanceDto>) { return this.svc.setAttendance(r.organizationId, id, b.userId, b.status); }

  @Post("meetings/:id/actions") @RequirePermission(CAPABILITIES.MEETING_MANAGE)
  action(@Req() r: Ctx, @Param("id") id: string, @Body(new ZodPipe(actionDto)) b: z.infer<typeof actionDto>) { return this.svc.addAction(r.organizationId, id, b); }
  @Post("meeting-actions/:id/convert") @RequirePermission(CAPABILITIES.MEETING_MANAGE)
  convert(@Req() r: Ctx, @Param("id") id: string, @Body(new ZodPipe(convertDto)) b: z.infer<typeof convertDto>) { return this.svc.convertAction(r.organizationId, r.userId, id, b); }
}
