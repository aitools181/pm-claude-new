import { Controller, Get, Req, UseGuards } from "@nestjs/common";
import { Request } from "express";
import { SessionGuard } from "../auth/guards/session.guard.js";
import { OrgContextGuard } from "../org-context/org-context.guard.js";
import { AuthzGuard } from "../authz/authz.guard.js";
import { RequirePermission } from "../authz/require-permission.decorator.js";
import { CAPABILITIES } from "../authz/capabilities.js";
import { ReleaseService } from "./release.service.js";

type Ctx = Request & { userId: string; organizationId: string };

/** Public: version + changelog (no auth) so status pages can read them. */
@Controller("release")
export class ReleasePublicController {
  constructor(private readonly svc: ReleaseService) {}
  @Get("version") version() { return this.svc.versionInfo(); }
  @Get("changelog") changelog() { return this.svc.changelog(); }
}

/** Authenticated: migration status + support bundle. */
@Controller("release")
@UseGuards(SessionGuard, OrgContextGuard, AuthzGuard)
export class ReleaseController {
  constructor(private readonly svc: ReleaseService) {}
  @Get("migration-status") @RequirePermission(CAPABILITIES.ORG_SETTINGS_MANAGE)
  status() { return this.svc.migrationStatus(); }
  @Get("support-bundle") @RequirePermission(CAPABILITIES.ORG_SETTINGS_MANAGE)
  bundle(@Req() r: Ctx) { return this.svc.supportBundle(r.organizationId); }
}
