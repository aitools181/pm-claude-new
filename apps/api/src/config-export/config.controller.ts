import { Body, Controller, Get, Post, Req, UseGuards } from "@nestjs/common";
import { Request } from "express";
import { z } from "zod";
import { ZodPipe } from "../common/zod.pipe.js";
import { SessionGuard } from "../auth/guards/session.guard.js";
import { OrgContextGuard } from "../org-context/org-context.guard.js";
import { AuthzGuard } from "../authz/authz.guard.js";
import { RequirePermission } from "../authz/require-permission.decorator.js";
import { CAPABILITIES } from "../authz/capabilities.js";
import { ConfigService } from "./config.service.js";

type Ctx = Request & { userId: string; organizationId: string };

@Controller("configuration")
@UseGuards(SessionGuard, OrgContextGuard, AuthzGuard)
export class ConfigController {
  constructor(private readonly config: ConfigService) {}

  @Get("export") @RequirePermission(CAPABILITIES.CONFIG_MANAGE)
  export(@Req() r: Ctx) { return this.config.export(r.organizationId); }

  @Post("import") @RequirePermission(CAPABILITIES.CONFIG_MANAGE)
  import(@Req() r: Ctx, @Body(new ZodPipe(z.object({ doc: z.any() }))) b: { doc: any }) { return this.config.import(r.organizationId, r.userId, b.doc); }
}
