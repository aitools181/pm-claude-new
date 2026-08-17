import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from "@nestjs/common";
import { Request } from "express";
import { z } from "zod";
import { SessionGuard } from "../auth/guards/session.guard.js";
import { OrgContextGuard } from "../org-context/org-context.guard.js";
import { AuthzGuard } from "../authz/authz.guard.js";
import { RequirePermission } from "../authz/require-permission.decorator.js";
import { CAPABILITIES } from "../authz/capabilities.js";
import { ZodPipe } from "../common/zod.pipe.js";
import { ServiceManagementService } from "./service-management.service.js";
import { RequiresModule, ModuleEnabledGuard } from "../modules/module-enabled.guard.js";

type Ctx = Request & { userId: string; organizationId: string };
const serviceProjectDto = z.object({ projectId: z.string().uuid(), key: z.string().min(1), name: z.string().min(1), portalEnabled: z.boolean().optional(), customerAccess: z.string().optional() });
const requestTypeDto = z.object({ name: z.string().min(1), description: z.string().optional(), workItemTypeKey: z.string().optional(), formSchema: z.array(z.unknown()).optional(), defaultPriority: z.string().optional() });
const requestDto = z.object({ title: z.string().min(1), description: z.string().optional(), priority: z.string().optional() });
const queueDto = z.object({ name: z.string().min(1), wql: z.string().min(1) });
const slaDto = z.object({ name: z.string().min(1), metric: z.enum(["first_response", "resolution", "custom"]), targetMinutes: z.number().int().positive(), startCondition: z.record(z.unknown()).optional(), pauseCondition: z.record(z.unknown()).optional(), stopCondition: z.record(z.unknown()).optional(), calendar: z.record(z.unknown()).optional() });
const clockDto = z.object({ action: z.enum(["pause", "resume", "stop", "refresh"]) });
const incidentDto = z.object({ workItemId: z.string().uuid(), severity: z.string().optional(), commanderUserId: z.string().uuid().optional(), responders: z.array(z.string().uuid()).optional(), stakeholderMessage: z.string().optional() });
const incidentUpdateDto = z.object({ status: z.string().optional(), stakeholderMessage: z.string().optional(), timelineEvent: z.string().optional(), postIncidentReview: z.record(z.unknown()).optional() });
const changeDto = z.object({ workItemId: z.string().uuid().optional(), title: z.string().min(1), changeType: z.string().optional(), riskScore: z.number().int().min(0).max(100).optional(), plannedStart: z.string().datetime().optional(), plannedEnd: z.string().datetime().optional(), rollbackPlan: z.string().optional(), deploymentLinks: z.array(z.unknown()).optional() });
const decisionDto = z.object({ decision: z.enum(["approve", "reject"]), reason: z.string().optional() });
const alertDto = z.object({ source: z.string().min(1), externalId: z.string().min(1), title: z.string().min(1), severity: z.string().min(1), fingerprint: z.string().optional(), raw: z.record(z.unknown()).optional() });
const onCallDto = z.object({ name: z.string().min(1), timezone: z.string().optional(), rotations: z.array(z.unknown()), escalationPolicy: z.array(z.unknown()).optional() });
const assetSchemaDto = z.object({ name: z.string().min(1), objectTypes: z.array(z.unknown()).optional(), fieldDefinitions: z.array(z.unknown()).optional() });
const assetDto = z.object({ schemaId: z.string().uuid(), objectType: z.string().min(1), key: z.string().min(1), name: z.string().min(1), status: z.string().optional(), attributes: z.record(z.unknown()).optional(), sensitive: z.boolean().optional() });
const relationDto = z.object({ fromItemId: z.string().uuid(), toItemId: z.string().uuid(), relationType: z.string().min(1) });

@Controller("service-management")
@UseGuards(SessionGuard, OrgContextGuard, AuthzGuard, ModuleEnabledGuard)
@RequiresModule("service_management")
export class ServiceManagementController {
  constructor(private readonly service: ServiceManagementService) {}
  @Get() overview(@Req() r: Ctx) { return this.service.overview(r.organizationId, r.userId); }
  @Get("catalogue") catalogue(@Req() r: Ctx) { return this.service.catalogue(r.organizationId); }
  @Post("projects") @RequirePermission(CAPABILITIES.SERVICE_MANAGE) project(@Req() r: Ctx, @Body(new ZodPipe(serviceProjectDto)) b: z.infer<typeof serviceProjectDto>) { return this.service.createServiceProject(r.organizationId, r.userId, b); }
  @Post("projects/:id/request-types") @RequirePermission(CAPABILITIES.SERVICE_MANAGE) requestType(@Req() r: Ctx, @Param("id") id: string, @Body(new ZodPipe(requestTypeDto)) b: z.infer<typeof requestTypeDto>) { return this.service.createRequestType(r.organizationId, id, b); }
  @Post("request-types/:id/submit") submit(@Req() r: Ctx, @Param("id") id: string, @Body(new ZodPipe(requestDto)) b: z.infer<typeof requestDto>) { return this.service.submitRequest(r.organizationId, r.userId, id, b); }
  @Post("projects/:id/queues") @RequirePermission(CAPABILITIES.SERVICE_MANAGE) queue(@Req() r: Ctx, @Param("id") id: string, @Body(new ZodPipe(queueDto)) b: z.infer<typeof queueDto>) { return this.service.createQueue(r.organizationId, r.userId, id, b); }
  @Get("queues/:id/items") queueItems(@Req() r: Ctx, @Param("id") id: string) { return this.service.queueItems(r.organizationId, r.userId, id); }
  @Post("projects/:id/slas") @RequirePermission(CAPABILITIES.SERVICE_MANAGE) sla(@Req() r: Ctx, @Param("id") id: string, @Body(new ZodPipe(slaDto)) b: z.infer<typeof slaDto>) { return this.service.createSla(r.organizationId, id, b as any); }
  @Post("sla-clocks/:id") @RequirePermission(CAPABILITIES.SERVICE_MANAGE) clock(@Req() r: Ctx, @Param("id") id: string, @Body(new ZodPipe(clockDto)) b: z.infer<typeof clockDto>) { return this.service.updateSlaClock(r.organizationId, r.userId, id, b.action); }
  @Post("incidents") @RequirePermission(CAPABILITIES.SERVICE_MANAGE) incident(@Req() r: Ctx, @Body(new ZodPipe(incidentDto)) b: z.infer<typeof incidentDto>) { return this.service.createIncident(r.organizationId, r.userId, b); }
  @Post("incidents/:id") @RequirePermission(CAPABILITIES.SERVICE_MANAGE) updateIncident(@Req() r: Ctx, @Param("id") id: string, @Body(new ZodPipe(incidentUpdateDto)) b: z.infer<typeof incidentUpdateDto>) { return this.service.updateIncident(r.organizationId, r.userId, id, b); }
  @Post("changes") @RequirePermission(CAPABILITIES.SERVICE_MANAGE) change(@Req() r: Ctx, @Body(new ZodPipe(changeDto)) b: z.infer<typeof changeDto>) { return this.service.createChange(r.organizationId, r.userId, b); }
  @Post("changes/:id/decision") @RequirePermission(CAPABILITIES.SERVICE_MANAGE) decision(@Req() r: Ctx, @Param("id") id: string, @Body(new ZodPipe(decisionDto)) b: z.infer<typeof decisionDto>) { return this.service.approveChange(r.organizationId, r.userId, id, b.decision, b.reason); }
  @Post("alerts") @RequirePermission(CAPABILITIES.SERVICE_MANAGE) alert(@Req() r: Ctx, @Body(new ZodPipe(alertDto)) b: z.infer<typeof alertDto>) { return this.service.ingestAlert(r.organizationId, b); }
  @Post("on-call") @RequirePermission(CAPABILITIES.SERVICE_MANAGE) onCall(@Req() r: Ctx, @Body(new ZodPipe(onCallDto)) b: z.infer<typeof onCallDto>) { return this.service.createOnCall(r.organizationId, b); }
  @Get("on-call/:id/current") current(@Req() r: Ctx, @Param("id") id: string, @Query("at") at?: string) { return this.service.currentOnCall(r.organizationId, id, at ? new Date(at) : new Date()); }
  @Post("assets/schemas") @RequirePermission(CAPABILITIES.SERVICE_MANAGE) assetSchema(@Req() r: Ctx, @Body(new ZodPipe(assetSchemaDto)) b: z.infer<typeof assetSchemaDto>) { return this.service.createAssetSchema(r.organizationId, b); }
  @Post("assets") @RequirePermission(CAPABILITIES.SERVICE_MANAGE) asset(@Req() r: Ctx, @Body(new ZodPipe(assetDto)) b: z.infer<typeof assetDto>) { return this.service.upsertAsset(r.organizationId, b); }
  @Post("assets/relations") @RequirePermission(CAPABILITIES.SERVICE_MANAGE) relation(@Req() r: Ctx, @Body(new ZodPipe(relationDto)) b: z.infer<typeof relationDto>) { return this.service.relateAssets(r.organizationId, b); }
  @Get("assets/:id/impact") impact(@Req() r: Ctx, @Param("id") id: string) { return this.service.impact(r.organizationId, r.userId, id); }
}
