import { Controller, Get, Req, UseGuards } from "@nestjs/common";
import { Request } from "express";
import { SessionGuard } from "../auth/guards/session.guard.js";
import { OrgContextGuard } from "../org-context/org-context.guard.js";
import { AuthzGuard } from "../authz/authz.guard.js";
import { RequirePermission } from "../authz/require-permission.decorator.js";
import { CAPABILITIES } from "../authz/capabilities.js";
import { AuditService } from "./audit.service.js";

@Controller("audit")
@UseGuards(SessionGuard, OrgContextGuard, AuthzGuard)
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  @Get()
  @RequirePermission(CAPABILITIES.AUDIT_READ)
  list(@Req() req: Request & { organizationId: string }) {
    return this.audit.listForOrg(req.organizationId);
  }
}
