import { Body, Controller, Get, Param, Post, Req, UseGuards } from "@nestjs/common";
import { Request } from "express";
import { z } from "zod";
import { SessionGuard } from "../auth/guards/session.guard.js";
import { OrgContextGuard } from "../org-context/org-context.guard.js";
import { AuthzGuard } from "../authz/authz.guard.js";
import { RequirePermission } from "../authz/require-permission.decorator.js";
import { CAPABILITIES } from "../authz/capabilities.js";
import { ZodPipe } from "../common/zod.pipe.js";
import { CommunicationsService } from "./communications.service.js";

type Ctx = Request & { userId: string; organizationId: string };
const mailboxDto = z.object({ integrationId: z.string().uuid().optional(), projectId: z.string().uuid().optional(), address: z.string().email(), name: z.string().min(1), routingRules: z.record(z.unknown()).optional() });
const emailDto = z.object({ mailboxId: z.string().uuid(), externalMessageId: z.string().min(1), externalThreadId: z.string().optional(), fromAddress: z.string().email(), toAddresses: z.array(z.string().email()), subject: z.string().min(1), bodyText: z.string().optional(), attachments: z.array(z.unknown()).optional(), headers: z.record(z.string()).optional(), sentAt: z.string().datetime().optional(), spf: z.enum(["pass", "fail", "unknown"]).optional(), dkim: z.enum(["pass", "fail", "unknown"]).optional() });
const replyDto = z.object({ bodyText: z.string().min(1), attachments: z.array(z.unknown()).optional(), template: z.string().optional(), signature: z.string().optional() });
const calendarDto = z.object({ integrationId: z.string().uuid().optional(), provider: z.enum(["google", "microsoft", "caldav"]), calendarExternalId: z.string().min(1) });
const syncDto = z.object({ syncToken: z.string().optional(), events: z.array(z.object({ externalEventId: z.string().min(1), title: z.string().min(1), startAt: z.string().datetime(), endAt: z.string().datetime(), workItemId: z.string().uuid().optional(), syncVersion: z.string().optional(), source: z.enum(["external", "platform"]).optional() })) });
const resolveDto = z.object({ choice: z.enum(["external", "platform"]), replacement: z.object({ title: z.string(), startAt: z.string().datetime(), endAt: z.string().datetime(), syncVersion: z.string().optional() }).optional() });
const clipDto = z.object({ projectId: z.string().uuid().optional(), workItemId: z.string().uuid().optional(), title: z.string().min(1), mediaRef: z.string().min(1), durationSeconds: z.number().int().min(0).optional(), consent: z.record(z.unknown()), retentionUntil: z.string().datetime().optional() });
const transcriptDto = z.object({ language: z.string().optional(), segments: z.array(z.unknown()), summary: z.string().optional(), decisions: z.array(z.unknown()).optional(), proposedActions: z.array(z.object({ title: z.string(), ownerUserId: z.string().uuid().optional(), dueDate: z.string().optional() })).optional() });
const meetingDto = z.object({ projectId: z.string().uuid().optional(), title: z.string().min(1), startAt: z.string().datetime().optional(), attendees: z.array(z.unknown()).optional(), transcriptId: z.string().uuid().optional(), summary: z.string().optional() });
const actionsDto = z.object({ actions: z.array(z.object({ title: z.string().min(1), projectId: z.string().uuid(), ownerUserId: z.string().uuid().optional(), dueDate: z.string().optional(), approved: z.boolean() })) });

@Controller("communications")
@UseGuards(SessionGuard, OrgContextGuard, AuthzGuard)
export class CommunicationsController {
  constructor(private readonly service: CommunicationsService) {}
  @Get() overview(@Req() r: Ctx) { return this.service.overview(r.organizationId, r.userId); }
  @Post("mailboxes") @RequirePermission(CAPABILITIES.COMMUNICATIONS_MANAGE) mailbox(@Req() r: Ctx, @Body(new ZodPipe(mailboxDto)) b: z.infer<typeof mailboxDto>) { return this.service.createMailbox(r.organizationId, r.userId, b); }
  @Post("email/inbound") @RequirePermission(CAPABILITIES.COMMUNICATIONS_MANAGE) inbound(@Req() r: Ctx, @Body(new ZodPipe(emailDto)) b: z.infer<typeof emailDto>) { return this.service.receiveEmail(r.organizationId, b); }
  @Get("email/threads/:id") thread(@Req() r: Ctx, @Param("id") id: string) { return this.service.thread(r.organizationId, r.userId, id); }
  @Post("email/threads/:id/reply") @RequirePermission(CAPABILITIES.COMMUNICATIONS_MANAGE) reply(@Req() r: Ctx, @Param("id") id: string, @Body(new ZodPipe(replyDto)) b: z.infer<typeof replyDto>) { return this.service.reply(r.organizationId, r.userId, id, b); }
  @Post("calendar/connections") calendar(@Req() r: Ctx, @Body(new ZodPipe(calendarDto)) b: z.infer<typeof calendarDto>) { return this.service.connectCalendar(r.organizationId, r.userId, b); }
  @Post("calendar/connections/:id/sync") sync(@Req() r: Ctx, @Param("id") id: string, @Body(new ZodPipe(syncDto)) b: z.infer<typeof syncDto>) { return this.service.syncCalendar(r.organizationId, r.userId, id, b); }
  @Post("calendar/events/:id/resolve") resolve(@Req() r: Ctx, @Param("id") id: string, @Body(new ZodPipe(resolveDto)) b: z.infer<typeof resolveDto>) { return this.service.resolveCalendarConflict(r.organizationId, r.userId, id, b.choice, b.replacement); }
  @Post("clips") @RequirePermission(CAPABILITIES.COMMUNICATIONS_MANAGE) clip(@Req() r: Ctx, @Body(new ZodPipe(clipDto)) b: z.infer<typeof clipDto>) { return this.service.createClip(r.organizationId, r.userId, b); }
  @Post("clips/:id/transcripts") @RequirePermission(CAPABILITIES.COMMUNICATIONS_MANAGE) transcript(@Req() r: Ctx, @Param("id") id: string, @Body(new ZodPipe(transcriptDto)) b: z.infer<typeof transcriptDto>) { return this.service.addTranscript(r.organizationId, id, b); }
  @Post("meetings") meeting(@Req() r: Ctx, @Body(new ZodPipe(meetingDto)) b: z.infer<typeof meetingDto>) { return this.service.createMeetingCapture(r.organizationId, r.userId, b); }
  @Post("meetings/:id/actions") review(@Req() r: Ctx, @Param("id") id: string, @Body(new ZodPipe(actionsDto)) b: z.infer<typeof actionsDto>) { return this.service.reviewActions(r.organizationId, r.userId, id, b); }
}
