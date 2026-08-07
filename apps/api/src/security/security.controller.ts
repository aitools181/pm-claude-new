import { Controller, Get, Req, UseGuards } from "@nestjs/common";
import { Request } from "express";
import { SessionGuard } from "../auth/guards/session.guard.js";
import { OrgContextGuard } from "../org-context/org-context.guard.js";
import { AuthzGuard } from "../authz/authz.guard.js";
import { RequirePermission } from "../authz/require-permission.decorator.js";
import { CAPABILITIES } from "../authz/capabilities.js";
import { SecurityAuditService } from "./security-audit.service.js";

type Ctx = Request & { userId: string; organizationId: string };

@Controller("security")
@UseGuards(SessionGuard, OrgContextGuard, AuthzGuard)
export class SecurityController {
  constructor(private readonly audit: SecurityAuditService) {}
  @Get("audit") @RequirePermission(CAPABILITIES.ORG_SETTINGS_MANAGE)
  run(@Req() r: Ctx) { return this.audit.run(r.organizationId); }
}
