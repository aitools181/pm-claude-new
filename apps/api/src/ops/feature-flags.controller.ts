import { Body, Controller, Get, Put, Req, UseGuards } from "@nestjs/common";
import { Request } from "express";
import { z } from "zod";
import { ZodPipe } from "../common/zod.pipe.js";
import { SessionGuard } from "../auth/guards/session.guard.js";
import { OrgContextGuard } from "../org-context/org-context.guard.js";
import { AuthzGuard } from "../authz/authz.guard.js";
import { RequirePermission } from "../authz/require-permission.decorator.js";
import { CAPABILITIES } from "../authz/capabilities.js";
import { FeatureFlagsService } from "./feature-flags.service.js";

const setDto = z.object({ key: z.string().min(1), enabled: z.boolean() });

@Controller("feature-flags")
@UseGuards(SessionGuard, OrgContextGuard, AuthzGuard)
export class FeatureFlagsController {
  constructor(private readonly flags: FeatureFlagsService) {}

  @Get()
  @RequirePermission(CAPABILITIES.FLAGS_MANAGE)
  list(@Req() req: Request & { organizationId: string }) { return this.flags.listForOrg(req.organizationId); }

  @Put()
  @RequirePermission(CAPABILITIES.FLAGS_MANAGE)
  set(@Req() req: Request & { userId: string; organizationId: string }, @Body(new ZodPipe(setDto)) b: { key: string; enabled: boolean }) {
    return this.flags.set(b.key, b.enabled, req.organizationId, req.userId).then(() => ({ ok: true }));
  }
}
