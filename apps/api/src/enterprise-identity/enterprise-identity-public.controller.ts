import { Body, Controller, Delete, Get, Inject, Param, Post, Put, Req, Res, UseGuards } from "@nestjs/common";
import { Request, Response } from "express";
import type { Env } from "@pm/shared";
import { ENV } from "../config/config.module.js";
import { z } from "zod";
import { ApiTokenGuard } from "../api/api-token.guard.js";
import { ScopeGuard } from "../api/scope.guard.js";
import { RequireScope } from "../api/require-scope.decorator.js";
import { SessionService } from "../auth/session.service.js";
import { ZodPipe } from "../common/zod.pipe.js";
import { EnterpriseIdentityService, type DirectoryEntry } from "./enterprise-identity.service.js";

const COOKIE = "pm_session";
const breakGlassDto = z.object({ organizationSlug: z.string().min(1), email: z.string().email(), code: z.string().min(8) });
const scimUserDto = z.object({
  id: z.string().optional(), externalId: z.string().optional(), userName: z.string().email(), displayName: z.string().optional(), active: z.boolean().optional(),
  name: z.object({ formatted: z.string().optional(), givenName: z.string().optional(), familyName: z.string().optional() }).optional(),
  groups: z.array(z.object({ value: z.string().optional(), display: z.string().optional() })).optional(),
  schemas: z.array(z.string()).optional(),
});
type ApiCtx = Request & { organizationId: string; userId: string };

@Controller("enterprise-identity")
export class EnterpriseIdentityPublicController {
  constructor(
    private readonly service: EnterpriseIdentityService,
    private readonly sessions: SessionService,
    @Inject(ENV) private readonly env: Env,
  ) {}
  private cookieOpts() {
    return {
      httpOnly: true,
      sameSite: "lax" as const,
      secure: this.env.NODE_ENV === "production",
      path: "/",
      maxAge: 1000 * 60 * 60 * 24 * 14,
    };
  }
  @Get("discovery/:domain") discover(@Param("domain") domain: string) { return this.service.discover(domain); }
  @Post("break-glass/login")
  async breakGlass(@Body(new ZodPipe(breakGlassDto)) body: z.infer<typeof breakGlassDto>, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const principal = await this.service.consumeBreakGlass(body);
    const raw = await this.sessions.create(principal.userId, { userAgent: req.headers["user-agent"], ip: req.ip });
    res.cookie(COOKIE, raw, this.cookieOpts());
    return principal;
  }
}

@Controller("scim/v2/:connectorId")
@UseGuards(ApiTokenGuard, ScopeGuard)
@RequireScope("scim:write")
export class ScimController {
  constructor(private readonly service: EnterpriseIdentityService) {}
  private entry(body: z.infer<typeof scimUserDto>, id?: string): DirectoryEntry {
    return {
      externalSubject: id ?? body.externalId ?? body.id ?? body.userName,
      email: body.userName,
      displayName: body.displayName ?? body.name?.formatted ?? ([body.name?.givenName, body.name?.familyName].filter(Boolean).join(" ") || body.userName),
      active: body.active ?? true,
      groups: (body.groups ?? []).map((g) => g.value ?? g.display).filter(Boolean) as string[],
      attributes: { scimSchemas: body.schemas ?? [], name: body.name ?? {} },
    };
  }
  @Get("Users") async list(@Req() req: ApiCtx, @Param("connectorId") connectorId: string) {
    const resources = await this.service.listScimUsers(req.organizationId, connectorId);
    return { schemas: ["urn:ietf:params:scim:api:messages:2.0:ListResponse"], totalResults: resources.length, startIndex: 1, itemsPerPage: resources.length, Resources: resources };
  }
  @Post("Users") create(@Req() req: ApiCtx, @Param("connectorId") connectorId: string, @Body(new ZodPipe(scimUserDto)) body: z.infer<typeof scimUserDto>) { return this.service.upsertScimUser(req.organizationId, req.userId, connectorId, this.entry(body)); }
  @Put("Users/:id") replace(@Req() req: ApiCtx, @Param("connectorId") connectorId: string, @Param("id") id: string, @Body(new ZodPipe(scimUserDto)) body: z.infer<typeof scimUserDto>) { return this.service.upsertScimUser(req.organizationId, req.userId, connectorId, this.entry(body, id)); }
  @Delete("Users/:id") remove(@Req() req: ApiCtx, @Param("connectorId") connectorId: string, @Param("id") id: string) { return this.service.deactivateScimUser(req.organizationId, req.userId, connectorId, id); }
}
