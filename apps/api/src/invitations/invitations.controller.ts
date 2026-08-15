import { Body, Controller, Delete, Get, Param, Post, Req, UseGuards } from "@nestjs/common";
import { Request } from "express";
import { z } from "zod";
import { ZodPipe } from "../common/zod.pipe.js";
import { SessionGuard } from "../auth/guards/session.guard.js";
import { OrgContextGuard } from "../org-context/org-context.guard.js";
import { AuthzGuard } from "../authz/authz.guard.js";
import { RequirePermission } from "../authz/require-permission.decorator.js";
import { CAPABILITIES } from "../authz/capabilities.js";
import { InvitationsService } from "./invitations.service.js";

const createDto = z.object({ email: z.string().email(), roleKey: z.string().min(1) });
const acceptDto = z.object({
  token: z.string().min(1),
  displayName: z.string().min(1).optional(),
  password: z.string().min(10).optional(),
});

@Controller("invitations")
export class InvitationsController {
  constructor(private readonly invites: InvitationsService) {}

  @Post()
  @UseGuards(SessionGuard, OrgContextGuard, AuthzGuard)
  @RequirePermission(CAPABILITIES.USERS_INVITE)
  create(
    @Req() req: Request & { userId: string; organizationId: string; id?: string },
    @Body(new ZodPipe(createDto)) body: { email: string; roleKey: string },
  ) {
    return this.invites.create(req.organizationId, req.userId, body.email, body.roleKey, req.header("x-request-id"));
  }

  @Get()
  @UseGuards(SessionGuard, OrgContextGuard, AuthzGuard)
  @RequirePermission(CAPABILITIES.USERS_INVITE)
  list(@Req() req: Request & { organizationId: string }) { return this.invites.list(req.organizationId); }

  @Post("bulk")
  @UseGuards(SessionGuard, OrgContextGuard, AuthzGuard)
  @RequirePermission(CAPABILITIES.USERS_INVITE)
  createBulk(
    @Req() req: Request & { userId: string; organizationId: string },
    @Body(new ZodPipe(z.object({ emails: z.array(z.string().trim().min(3).max(320)).min(1).max(200), roleKey: z.string().min(1) }))) body: { emails: string[]; roleKey: string },
  ) {
    return this.invites.createBulk(req.organizationId, req.userId, body.emails, body.roleKey, req.header("x-request-id"));
  }

  @Post("import-csv")
  @UseGuards(SessionGuard, OrgContextGuard, AuthzGuard)
  @RequirePermission(CAPABILITIES.USERS_INVITE)
  importCsv(
    @Req() req: Request & { userId: string; organizationId: string },
    @Body(new ZodPipe(z.object({ csv: z.string().min(3).max(500_000), defaultRoleKey: z.string().min(1) }))) body: { csv: string; defaultRoleKey: string },
  ) {
    return this.invites.importCsv(req.organizationId, req.userId, body.csv, body.defaultRoleKey, req.header("x-request-id"));
  }

  @Delete(":id")
  @UseGuards(SessionGuard, OrgContextGuard, AuthzGuard)
  @RequirePermission(CAPABILITIES.USERS_INVITE)
  revoke(@Req() req: Request & { userId: string; organizationId: string }, @Param("id") id: string) {
    return this.invites.revoke(req.organizationId, id, req.userId, req.header("x-request-id")).then(() => ({ ok: true }));
  }

  @Post(":id/resend")
  @UseGuards(SessionGuard, OrgContextGuard, AuthzGuard)
  @RequirePermission(CAPABILITIES.USERS_INVITE)
  resend(@Req() req: Request & { userId: string; organizationId: string }, @Param("id") id: string) {
    return this.invites.resend(req.organizationId, id, req.userId).then(() => ({ ok: true }));
  }

  /** Public — accepting an invitation does not require an existing session. */
  @Post("accept")
  accept(@Body(new ZodPipe(acceptDto)) body: z.infer<typeof acceptDto>) {
    const newUser = body.displayName && body.password ? { displayName: body.displayName, password: body.password } : undefined;
    return this.invites.accept(body.token, newUser);
  }
}
