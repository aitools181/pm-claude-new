import { Body, Controller, Get, Param, Post, Req, UseGuards } from "@nestjs/common";
import { Request } from "express";
import { z } from "zod";
import { SessionGuard } from "../auth/guards/session.guard.js";
import { OrgContextGuard } from "../org-context/org-context.guard.js";
import { AuthzGuard } from "../authz/authz.guard.js";
import { RequirePermission } from "../authz/require-permission.decorator.js";
import { CAPABILITIES } from "../authz/capabilities.js";
import { ZodPipe } from "../common/zod.pipe.js";
import { SandboxService } from "./sandbox.service.js";

type Ctx = Request & { userId: string; organizationId: string };
const envDto = z.object({ name: z.string().min(1), mode: z.enum(["configuration_only", "masked_sample"]).optional(), label: z.string().optional() });
const packageDto = z.object({ sandboxId: z.string().uuid().optional(), name: z.string().min(1), description: z.string().optional(), sourceOrganizationId: z.string().uuid().optional() });
const diffDto = z.object({ targetOrganizationId: z.string().uuid().optional() });
const promotionDto = z.object({ packageVersionId: z.string().uuid(), targetOrganizationId: z.string().uuid().optional(), scheduledFor: z.string().datetime().optional() });

@Controller("sandbox")
@UseGuards(SessionGuard, OrgContextGuard, AuthzGuard)
@RequirePermission(CAPABILITIES.SANDBOX_MANAGE)
export class SandboxController {
  constructor(private readonly service: SandboxService) {}
  @Get() list(@Req() r: Ctx) { return this.service.list(r.organizationId); }
  @Post("environments") createEnvironment(@Req() r: Ctx, @Body(new ZodPipe(envDto)) b: z.infer<typeof envDto>) { return this.service.createEnvironment(r.organizationId, r.userId, b); }
  @Post("packages") buildPackage(@Req() r: Ctx, @Body(new ZodPipe(packageDto)) b: z.infer<typeof packageDto>) { return this.service.buildPackage(r.organizationId, r.userId, b); }
  @Post("versions/:id/diff") diff(@Req() r: Ctx, @Param("id") id: string, @Body(new ZodPipe(diffDto)) b: z.infer<typeof diffDto>) { return this.service.diff(r.organizationId, id, b.targetOrganizationId); }
  @Post("promotions") request(@Req() r: Ctx, @Body(new ZodPipe(promotionDto)) b: z.infer<typeof promotionDto>) { return this.service.requestPromotion(r.organizationId, r.userId, b); }
  @Post("promotions/:id/approve") approve(@Req() r: Ctx, @Param("id") id: string) { return this.service.approveAndPromote(r.organizationId, r.userId, id); }
  @Post("promotions/:id/rollback") rollback(@Req() r: Ctx, @Param("id") id: string) { return this.service.rollback(r.organizationId, r.userId, id); }
}
