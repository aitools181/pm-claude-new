import { Body, Controller, Delete, Get, Param, Post, Query, Req, UseGuards } from "@nestjs/common";
import { Request } from "express";
import { z } from "zod";
import { ZodPipe } from "../common/zod.pipe.js";
import { APP_VERSION, APP_RELEASE_NAME } from "@pm/shared";
import { SessionGuard } from "../auth/guards/session.guard.js";
import { PlatformAdminGuard } from "./platform-admin.guard.js";
import { PlatformAdminService } from "./platform-admin.service.js";
import { DataOpsService } from "../data-ops/data-ops.service.js";

type Ctx = Request & { userId: string };
const grantDto = z.object({ email: z.string().email(), note: z.string().max(300).optional() });
const statusDto = z.object({ status: z.enum(["active", "suspended", "archived"]) });
const moduleDto = z.object({ module: z.string().min(1), enabled: z.boolean() });
const flagDto = z.object({ key: z.string().min(1).max(120), enabled: z.boolean() });

@Controller("superadmin")
@UseGuards(SessionGuard)
export class PlatformAdminController {
  constructor(private readonly platform: PlatformAdminService, private readonly dataOps: DataOpsService) {}

  /** Session-guarded only: lets the UI decide whether to show the console. */
  @Get("me")
  async me(@Req() r: Ctx) { return { platformAdmin: await this.platform.isPlatformAdmin(r.userId) }; }

  @Get("version") @UseGuards(PlatformAdminGuard) version() { return { version: APP_VERSION, release: APP_RELEASE_NAME, node: process.version, startedAt: new Date(Date.now() - Math.floor(process.uptime() * 1000)).toISOString() }; }

  @Get("stats") @UseGuards(PlatformAdminGuard) stats() { return this.platform.stats(); }
  @Get("organizations") @UseGuards(PlatformAdminGuard) orgs() { return this.platform.listOrganizations(); }
  @Post("organizations/:id/status") @UseGuards(PlatformAdminGuard)
  setStatus(@Req() r: Ctx, @Param("id") id: string, @Body(new ZodPipe(statusDto)) b: z.infer<typeof statusDto>) { return this.platform.setOrganizationStatus(r.userId, id, b.status); }

  @Get("organizations/:id/modules") @UseGuards(PlatformAdminGuard) modules(@Param("id") id: string) { return this.platform.organizationModules(id); }
  @Post("organizations/:id/modules") @UseGuards(PlatformAdminGuard)
  setModule(@Req() r: Ctx, @Param("id") id: string, @Body(new ZodPipe(moduleDto)) b: z.infer<typeof moduleDto>) { return this.platform.setOrganizationModule(r.userId, id, b.module, b.enabled); }

  @Get("flags") @UseGuards(PlatformAdminGuard) flags() { return this.platform.listPlatformFlags(); }
  @Post("flags") @UseGuards(PlatformAdminGuard)
  setFlag(@Req() r: Ctx, @Body(new ZodPipe(flagDto)) b: z.infer<typeof flagDto>) { return this.platform.setPlatformFlag(r.userId, b.key, b.enabled); }

  @Get("admins") @UseGuards(PlatformAdminGuard) admins() { return this.platform.listAdmins(); }
  @Post("admins") @UseGuards(PlatformAdminGuard)
  grant(@Req() r: Ctx, @Body(new ZodPipe(grantDto)) b: z.infer<typeof grantDto>) { return this.platform.grantAdmin(r.userId, b.email, b.note); }
  @Delete("admins/:userId") @UseGuards(PlatformAdminGuard)
  revoke(@Req() r: Ctx, @Param("userId") userId: string) { return this.platform.revokeAdmin(r.userId, userId); }

  @Get("audit") @UseGuards(PlatformAdminGuard) audit(@Query("limit") limit?: string) { return this.platform.auditLog(limit ? Number(limit) : 100); }

  // ---- F01 support access ----
  @Get("support-access") @UseGuards(PlatformAdminGuard) supportAccess() { return this.platform.listSupportAccess(); }
  @Post("support-access") @UseGuards(PlatformAdminGuard)
  startSupportAccess(@Req() r: Ctx, @Body(new ZodPipe(z.object({ organizationId: z.string().uuid(), reason: z.string().trim().min(5).max(500), minutes: z.number().int().min(15).max(480).default(60) }))) b: { organizationId: string; reason: string; minutes: number }) {
    return this.platform.startSupportAccess(r.userId, b.organizationId, b.reason, b.minutes);
  }
  @Delete("support-access/:grantId") @UseGuards(PlatformAdminGuard)
  endSupportAccess(@Req() r: Ctx, @Param("grantId") grantId: string) { return this.platform.endSupportAccess(r.userId, grantId); }

  // ---- F01 export-before-archive ----
  @Post("organizations/:id/export") @UseGuards(PlatformAdminGuard)
  async exportOrganization(@Req() r: Ctx, @Param("id") id: string) {
    const bundle = await this.dataOps.exportOrg(id);
    const counts = Object.fromEntries(Object.entries(bundle as Record<string, unknown>).map(([k, v]) => [k, Array.isArray(v) ? v.length : typeof v]));
    await this.platform.markOrganizationExported(r.userId, id, { counts });
    return { exportedAt: new Date().toISOString(), bundle };
  }

  // ---- NFR 8.4 observability + F01 storage metering ----
  @Get("metrics") @UseGuards(PlatformAdminGuard)
  metrics(@Query("format") format?: string) { return this.platform.metrics(format === "prometheus"); }

  @Get("organizations/:id/storage") @UseGuards(PlatformAdminGuard)
  storage(@Param("id") id: string) { return this.platform.storageUsage(id); }
}
