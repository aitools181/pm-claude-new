import { Body, Controller, Get, Headers, Param, Post, Req, UseGuards } from "@nestjs/common";
import { Request } from "express";
import { z } from "zod";
import { SessionGuard } from "../auth/guards/session.guard.js";
import { OrgContextGuard } from "../org-context/org-context.guard.js";
import { AuthzGuard } from "../authz/authz.guard.js";
import { RequirePermission } from "../authz/require-permission.decorator.js";
import { CAPABILITIES } from "../authz/capabilities.js";
import { ZodPipe } from "../common/zod.pipe.js";
import { DevOpsService } from "./devops.service.js";

type Ctx = Request & { userId: string; organizationId: string };
const repoDto = z.object({ provider: z.enum(["github", "gitlab", "bitbucket", "generic"]), integrationId: z.string().uuid().optional(), projectId: z.string().uuid().optional(), externalId: z.string().min(1), name: z.string().min(1), url: z.string().url().optional(), isPrivate: z.boolean().optional() });
const envDto = z.object({ projectId: z.string().uuid().optional(), name: z.string().min(1), environmentType: z.string().optional(), protected: z.boolean().optional() });
const eventDto = z.object({ provider: z.string().min(1), integrationId: z.string().uuid(), payload: z.string(), event: z.record(z.unknown()) });
const doraDto = z.object({ projectId: z.string().uuid().optional(), periodStart: z.string().datetime(), periodEnd: z.string().datetime() });

@Controller("devops")
@UseGuards(SessionGuard, OrgContextGuard, AuthzGuard)
export class DevOpsController {
  constructor(private readonly service: DevOpsService) {}
  @Get() list(@Req() r: Ctx) { return this.service.list(r.organizationId, r.userId); }
  @Post("repositories") @RequirePermission(CAPABILITIES.DEVOPS_MANAGE) repository(@Req() r: Ctx, @Body(new ZodPipe(repoDto)) b: z.infer<typeof repoDto>) { return this.service.createRepository(r.organizationId, r.userId, b); }
  @Post("environments") @RequirePermission(CAPABILITIES.DEVOPS_MANAGE) environment(@Req() r: Ctx, @Body(new ZodPipe(envDto)) b: z.infer<typeof envDto>) { return this.service.createEnvironment(r.organizationId, r.userId, b); }
  @Post("events") @RequirePermission(CAPABILITIES.DEVOPS_MANAGE) event(@Req() r: Ctx, @Headers("x-pm-signature") signature: string, @Body(new ZodPipe(eventDto)) b: z.infer<typeof eventDto>) { return this.service.ingest(r.organizationId, { ...b, signature, event: b.event as any }); }
  @Get("items/:id") item(@Req() r: Ctx, @Param("id") id: string) { return this.service.itemPanel(r.organizationId, r.userId, id); }
  @Get("projects/:id/readiness") readiness(@Req() r: Ctx, @Param("id") id: string) { return this.service.readiness(r.organizationId, r.userId, id); }
  @Post("metrics/dora") @RequirePermission(CAPABILITIES.DEVOPS_MANAGE) dora(@Req() r: Ctx, @Body(new ZodPipe(doraDto)) b: z.infer<typeof doraDto>) { return this.service.calculateDora(r.organizationId, r.userId, b); }
}
