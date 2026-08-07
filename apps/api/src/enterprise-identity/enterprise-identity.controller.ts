import { Body, Controller, Get, Param, Post, Req, UseGuards } from "@nestjs/common";
import { Request } from "express";
import { z } from "zod";
import { SessionGuard } from "../auth/guards/session.guard.js";
import { OrgContextGuard } from "../org-context/org-context.guard.js";
import { AuthzGuard } from "../authz/authz.guard.js";
import { RequirePermission } from "../authz/require-permission.decorator.js";
import { CAPABILITIES } from "../authz/capabilities.js";
import { ZodPipe } from "../common/zod.pipe.js";
import { EnterpriseIdentityService } from "./enterprise-identity.service.js";

type Ctx = Request & { userId: string; organizationId: string };
const providerDto = z.object({ kind: z.enum(["saml", "oidc"]), name: z.string().min(1), issuerUrl: z.string().url().optional(), metadataUrl: z.string().url().optional(), clientId: z.string().optional(), config: z.record(z.unknown()).optional() });
const enforceDto = z.object({ mode: z.enum(["optional", "approved_domains", "enforced"]), testMode: z.boolean() });
const domainDto = z.object({ domain: z.string().min(3), providerId: z.string().uuid().optional() });
const verifyDto = z.object({ token: z.string().min(8) });
const connectorDto = z.object({ kind: z.enum(["ldap", "active_directory", "scim"]), name: z.string().min(1), config: z.record(z.unknown()).optional(), credentialRef: z.string().optional(), scheduleCron: z.string().optional() });
const mappingDto = z.object({ connectorId: z.string().uuid(), externalGroup: z.string().min(1), targetRoleKey: z.string().optional(), targetTeamId: z.string().uuid().optional(), highRisk: z.boolean().optional() });
const syncDto = z.object({ mode: z.enum(["preview", "apply"]), entries: z.array(z.object({ externalSubject: z.string().min(1), email: z.string().email(), displayName: z.string().min(1), active: z.boolean().optional(), groups: z.array(z.string()).optional(), attributes: z.record(z.unknown()).optional() })) });
const exemptionDto = z.object({ targetUserId: z.string().uuid(), reason: z.string().min(3), expiresAt: z.string().datetime() });
const breakGlassDto = z.object({ targetUserId: z.string().uuid() });

@Controller("enterprise-identity")
@UseGuards(SessionGuard, OrgContextGuard, AuthzGuard)
@RequirePermission(CAPABILITIES.ENTERPRISE_IDENTITY_MANAGE)
export class EnterpriseIdentityController {
  constructor(private readonly service: EnterpriseIdentityService) {}
  @Get() list(@Req() r: Ctx) { return this.service.list(r.organizationId); }
  @Post("providers") createProvider(@Req() r: Ctx, @Body(new ZodPipe(providerDto)) b: z.infer<typeof providerDto>) { return this.service.createProvider(r.organizationId, r.userId, b); }
  @Post("providers/:id/probe") probe(@Req() r: Ctx, @Param("id") id: string) { return this.service.probeProvider(r.organizationId, id); }
  @Post("providers/:id/enforcement") enforce(@Req() r: Ctx, @Param("id") id: string, @Body(new ZodPipe(enforceDto)) b: z.infer<typeof enforceDto>) { return this.service.enforce(r.organizationId, id, b.mode, b.testMode); }
  @Post("domains") domain(@Req() r: Ctx, @Body(new ZodPipe(domainDto)) b: z.infer<typeof domainDto>) { return this.service.createDomain(r.organizationId, r.userId, b.domain, b.providerId); }
  @Post("domains/:id/verify") verify(@Req() r: Ctx, @Param("id") id: string, @Body(new ZodPipe(verifyDto)) b: z.infer<typeof verifyDto>) { return this.service.verifyDomain(r.organizationId, id, b.token); }
  @Post("connectors") connector(@Req() r: Ctx, @Body(new ZodPipe(connectorDto)) b: z.infer<typeof connectorDto>) { return this.service.createConnector(r.organizationId, r.userId, b); }
  @Post("mappings") mapping(@Req() r: Ctx, @Body(new ZodPipe(mappingDto)) b: z.infer<typeof mappingDto>) { return this.service.addMapping(r.organizationId, r.userId, b); }
  @Post("mappings/:id/approve") approve(@Req() r: Ctx, @Param("id") id: string) { return this.service.approveMapping(r.organizationId, r.userId, id); }
  @Post("connectors/:id/sync") sync(@Req() r: Ctx, @Param("id") id: string, @Body(new ZodPipe(syncDto)) b: z.infer<typeof syncDto>) { return this.service.sync(r.organizationId, r.userId, id, b.mode, b.entries); }
  @Post("exemptions") exemption(@Req() r: Ctx, @Body(new ZodPipe(exemptionDto)) b: z.infer<typeof exemptionDto>) { return this.service.addExemption(r.organizationId, r.userId, b); }
  @Post("break-glass") breakGlass(@Req() r: Ctx, @Body(new ZodPipe(breakGlassDto)) b: z.infer<typeof breakGlassDto>) { return this.service.issueBreakGlass(r.organizationId, r.userId, b.targetUserId); }
}
