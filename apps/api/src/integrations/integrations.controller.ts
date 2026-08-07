import { Body, Controller, Get, Param, Post, Req, UseGuards } from "@nestjs/common";
import { Request } from "express";
import { z } from "zod";
import { ZodPipe } from "../common/zod.pipe.js";
import { SessionGuard } from "../auth/guards/session.guard.js";
import { OrgContextGuard } from "../org-context/org-context.guard.js";
import { AuthzGuard } from "../authz/authz.guard.js";
import { RequirePermission } from "../authz/require-permission.decorator.js";
import { CAPABILITIES } from "../authz/capabilities.js";
import { IntegrationService } from "./integration.service.js";

type Ctx = Request & { userId: string; organizationId: string };
const createDto = z.object({ kind: z.enum(["email", "calendar", "github", "gitlab", "generic"]), name: z.string().min(1), config: z.record(z.any()).optional(), secret: z.string().optional() });
const credDto = z.object({ secret: z.string().min(1) });
const statusDto = z.object({ status: z.enum(["connected", "disconnected"]) });

@Controller("integrations")
@UseGuards(SessionGuard, OrgContextGuard, AuthzGuard)
export class IntegrationsController {
  constructor(private readonly svc: IntegrationService) {}

  @Get() list(@Req() r: Ctx) { return this.svc.list(r.organizationId); }
  @Post() @RequirePermission(CAPABILITIES.INTEGRATION_MANAGE)
  create(@Req() r: Ctx, @Body(new ZodPipe(createDto)) b: z.infer<typeof createDto>) { return this.svc.create(r.organizationId, r.userId, b); }
  @Get(":id") get(@Req() r: Ctx, @Param("id") id: string) { return this.svc.get(r.organizationId, id); }
  @Post(":id/credential") @RequirePermission(CAPABILITIES.INTEGRATION_MANAGE)
  rotate(@Req() r: Ctx, @Param("id") id: string, @Body(new ZodPipe(credDto)) b: z.infer<typeof credDto>) { return this.svc.rotateCredential(r.organizationId, id, b.secret); }
  @Post(":id/status") @RequirePermission(CAPABILITIES.INTEGRATION_MANAGE)
  status(@Req() r: Ctx, @Param("id") id: string, @Body(new ZodPipe(statusDto)) b: z.infer<typeof statusDto>) { return this.svc.setStatus(r.organizationId, id, b.status); }
  @Post(":id/health-check") @RequirePermission(CAPABILITIES.INTEGRATION_MANAGE)
  health(@Req() r: Ctx, @Param("id") id: string) { return this.svc.runHealthCheck(r.organizationId, id); }
}
