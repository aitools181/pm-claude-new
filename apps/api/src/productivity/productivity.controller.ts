import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from "@nestjs/common";
import { Request } from "express";
import { z } from "zod";
import { SessionGuard } from "../auth/guards/session.guard.js";
import { OrgContextGuard } from "../org-context/org-context.guard.js";
import { AuthzGuard } from "../authz/authz.guard.js";
import { RequirePermission } from "../authz/require-permission.decorator.js";
import { CAPABILITIES } from "../authz/capabilities.js";
import { ZodPipe } from "../common/zod.pipe.js";
import { ProductivityService } from "./productivity.service.js";

type Ctx = Request & { userId: string; organizationId: string };
const noteDto = z.object({ title: z.string().min(1), body: z.string().optional(), pinned: z.boolean().optional(), shared: z.boolean().optional(), retentionUntil: z.string().datetime().optional() });
const notePatchDto = z.object({ title: z.string().min(1).optional(), body: z.string().optional(), pinned: z.boolean().optional(), shared: z.boolean().optional() });
const noteTaskDto = z.object({ projectId: z.string().uuid(), selectedText: z.string().optional() });
const reminderDto = z.object({ title: z.string().min(1), dueAt: z.string().datetime(), timezone: z.string().optional(), recurrence: z.string().optional(), workItemId: z.string().uuid().optional(), delegatedToUserId: z.string().uuid().optional() });
const reminderActionDto = z.object({ action: z.enum(["snooze", "complete", "reopen"]), until: z.string().datetime().optional() });
const projectDto = z.object({ projectId: z.string().uuid() });
const mapDto = z.object({ name: z.string().min(1), projectId: z.string().uuid().optional(), sourceType: z.string().optional(), sourceId: z.string().uuid().optional(), shared: z.boolean().optional(), generateFromProject: z.boolean().optional() });
const nodeDto = z.object({ parentNodeId: z.string().uuid().optional(), workItemId: z.string().uuid().optional(), label: z.string().min(1), x: z.number().optional(), y: z.number().optional(), style: z.record(z.unknown()).optional() });
const locationDto = z.object({ workItemId: z.string().uuid(), latitude: z.number().min(-90).max(90), longitude: z.number().min(-180).max(180), label: z.string().optional(), precision: z.string().optional(), sensitive: z.boolean().optional() });
const captureDto = z.object({ targetType: z.enum(["task", "idea", "doc", "inbox"]), targetId: z.string().uuid().optional(), projectId: z.string().uuid().optional(), url: z.string().url(), title: z.string().optional(), selectedText: z.string().optional(), screenshotRef: z.string().optional() });
const deviceDto = z.object({ deviceId: z.string().min(1), platform: z.string().min(1), pushToken: z.string().optional(), clientVersion: z.string().optional() });
const offlineDto = z.object({ deviceId: z.string().min(1), operationKey: z.string().min(1), action: z.string().min(1), payload: z.record(z.unknown()), baseVersion: z.number().int().optional() });

@Controller("productivity")
@UseGuards(SessionGuard, OrgContextGuard, AuthzGuard)
@RequirePermission(CAPABILITIES.PRODUCTIVITY_USE)
export class ProductivityController {
  constructor(private readonly service: ProductivityService) {}
  @Get() home(@Req() r: Ctx) { return this.service.home(r.organizationId, r.userId); }
  @Post("notes") note(@Req() r: Ctx, @Body(new ZodPipe(noteDto)) b: z.infer<typeof noteDto>) { return this.service.createNote(r.organizationId, r.userId, b); }
  @Post("notes/:id") updateNote(@Req() r: Ctx, @Param("id") id: string, @Body(new ZodPipe(notePatchDto)) b: z.infer<typeof notePatchDto>) { return this.service.updateNote(r.organizationId, r.userId, id, b); }
  @Post("notes/:id/to-task") noteTask(@Req() r: Ctx, @Param("id") id: string, @Body(new ZodPipe(noteTaskDto)) b: z.infer<typeof noteTaskDto>) { return this.service.noteToTask(r.organizationId, r.userId, id, b.projectId, b.selectedText); }
  @Post("reminders") reminder(@Req() r: Ctx, @Body(new ZodPipe(reminderDto)) b: z.infer<typeof reminderDto>) { return this.service.createReminder(r.organizationId, r.userId, b); }
  @Post("reminders/:id/action") reminderAction(@Req() r: Ctx, @Param("id") id: string, @Body(new ZodPipe(reminderActionDto)) b: z.infer<typeof reminderActionDto>) { return this.service.reminderAction(r.organizationId, r.userId, id, b); }
  @Post("reminders/:id/to-task") reminderTask(@Req() r: Ctx, @Param("id") id: string, @Body(new ZodPipe(projectDto)) b: z.infer<typeof projectDto>) { return this.service.reminderToTask(r.organizationId, r.userId, id, b.projectId); }
  @Post("mind-maps") mindMap(@Req() r: Ctx, @Body(new ZodPipe(mapDto)) b: z.infer<typeof mapDto>) { return this.service.createMindMap(r.organizationId, r.userId, b); }
  @Get("mind-maps/:id") getMap(@Req() r: Ctx, @Param("id") id: string) { return this.service.mindMap(r.organizationId, r.userId, id); }
  @Post("mind-maps/:id/nodes") node(@Req() r: Ctx, @Param("id") id: string, @Body(new ZodPipe(nodeDto)) b: z.infer<typeof nodeDto>) { return this.service.addMindMapNode(r.organizationId, r.userId, id, b); }
  @Post("mind-map-nodes/:id/to-task") nodeTask(@Req() r: Ctx, @Param("id") id: string, @Body(new ZodPipe(projectDto)) b: z.infer<typeof projectDto>) { return this.service.nodeToTask(r.organizationId, r.userId, id, b.projectId); }
  @Post("locations") location(@Req() r: Ctx, @Body(new ZodPipe(locationDto)) b: z.infer<typeof locationDto>) { return this.service.setLocation(r.organizationId, r.userId, b); }
  @Get("map") map(@Req() r: Ctx, @Query("minLat") minLat?: string, @Query("maxLat") maxLat?: string, @Query("minLng") minLng?: string, @Query("maxLng") maxLng?: string) { return this.service.mapView(r.organizationId, r.userId, { minLat: minLat ? Number(minLat) : undefined, maxLat: maxLat ? Number(maxLat) : undefined, minLng: minLng ? Number(minLng) : undefined, maxLng: maxLng ? Number(maxLng) : undefined }); }
  @Post("browser-captures") capture(@Req() r: Ctx, @Body(new ZodPipe(captureDto)) b: z.infer<typeof captureDto>) { return this.service.capture(r.organizationId, r.userId, b); }
  @Post("devices") device(@Req() r: Ctx, @Body(new ZodPipe(deviceDto)) b: z.infer<typeof deviceDto>) { return this.service.registerDevice(r.organizationId, r.userId, b); }
  @Post("devices/:id/revoke") revoke(@Req() r: Ctx, @Param("id") id: string) { return this.service.revokeDevice(r.organizationId, r.userId, id); }
  @Post("offline") offline(@Req() r: Ctx, @Body(new ZodPipe(offlineDto)) b: z.infer<typeof offlineDto>) { return this.service.queueOffline(r.organizationId, r.userId, b); }
  @Post("offline/:deviceId/replay") replay(@Req() r: Ctx, @Param("deviceId") deviceId: string) { return this.service.replayOffline(r.organizationId, r.userId, deviceId); }
}
