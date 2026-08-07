import { Body, Controller, Get, Param, Post, Query, Req, UseGuards, UseInterceptors } from "@nestjs/common";
import { Request } from "express";
import { z } from "zod";
import { ZodPipe } from "../common/zod.pipe.js";
import { SessionGuard } from "../auth/guards/session.guard.js";
import { OrgContextGuard } from "../org-context/org-context.guard.js";
import { AuthzGuard } from "../authz/authz.guard.js";
import { RequirePermission } from "../authz/require-permission.decorator.js";
import { CAPABILITIES } from "../authz/capabilities.js";
import { ApiTokenService } from "./api-token.service.js";
import { PublicApiService } from "./public-api.service.js";
import { ApiTokenGuard } from "./api-token.guard.js";
import { ScopeGuard } from "./scope.guard.js";
import { RequireScope } from "./require-scope.decorator.js";
import { IdempotencyInterceptor } from "./idempotency.interceptor.js";
import { OPENAPI_DOC } from "./openapi.js";

type Ctx = Request & { userId: string; organizationId: string; apiScopes: string[] };
const tokenDto = z.object({ name: z.string().min(1), scopes: z.array(z.string()).min(1), expiresInDays: z.number().int().positive().optional() });
const createItemDto = z.object({ projectId: z.string().uuid(), title: z.string().min(1) });

/** Token management (session-authenticated console). */
@Controller("api-tokens")
@UseGuards(SessionGuard, OrgContextGuard, AuthzGuard)
export class ApiTokensController {
  constructor(private readonly tokens: ApiTokenService) {}
  @Get() list(@Req() r: Ctx) { return this.tokens.list(r.organizationId); }
  @Post() @RequirePermission(CAPABILITIES.TOKEN_MANAGE)
  create(@Req() r: Ctx, @Body(new ZodPipe(tokenDto)) b: z.infer<typeof tokenDto>) { return this.tokens.create(r.organizationId, r.userId, b); }
  @Post(":id/revoke") @RequirePermission(CAPABILITIES.TOKEN_MANAGE)
  revoke(@Req() r: Ctx, @Param("id") id: string) { return this.tokens.revoke(r.organizationId, id); }
}

/** Public OpenAPI contract (no auth). */
@Controller("public-api/v1")
export class OpenApiController {
  @Get("openapi.json") doc() { return OPENAPI_DOC; }
}

/** The versioned public API — token + scope authenticated. */
@Controller("public-api/v1")
@UseGuards(ApiTokenGuard, ScopeGuard)
export class PublicApiController {
  constructor(private readonly api: PublicApiService) {}

  @Get("work-items") @RequireScope("work:read")
  list(@Req() r: Ctx, @Query("limit") limit?: string, @Query("cursor") cursor?: string, @Query("projectId") projectId?: string, @Query("status") status?: string) {
    return this.api.listWorkItems(r.organizationId, { limit: limit ? Number(limit) : undefined, cursor, projectId, status });
  }

  @Post("work-items") @RequireScope("work:write") @UseInterceptors(IdempotencyInterceptor)
  create(@Req() r: Ctx, @Body(new ZodPipe(createItemDto)) b: z.infer<typeof createItemDto>) { return this.api.createWorkItem(r.organizationId, r.userId, b); }
}
