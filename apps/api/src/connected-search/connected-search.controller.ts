import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from "@nestjs/common";
import { Request } from "express";
import { z } from "zod";
import { SessionGuard } from "../auth/guards/session.guard.js";
import { OrgContextGuard } from "../org-context/org-context.guard.js";
import { AuthzGuard } from "../authz/authz.guard.js";
import { RequirePermission } from "../authz/require-permission.decorator.js";
import { CAPABILITIES } from "../authz/capabilities.js";
import { ZodPipe } from "../common/zod.pipe.js";
import { ConnectedSearchService } from "./connected-search.service.js";

type Ctx = Request & { userId: string; organizationId: string };
const connectorDto = z.object({ integrationId: z.string().uuid().optional(), kind: z.string().min(1), name: z.string().min(1), mode: z.enum(["indexed", "live"]).optional(), scheduleCron: z.string().optional(), retentionDays: z.number().int().min(1).max(3650).optional(), config: z.record(z.unknown()).optional() });
const scopeDto = z.object({ externalScopeId: z.string().min(1), label: z.string().optional(), include: z.boolean().optional(), rules: z.record(z.unknown()).optional() });
const crawlDto = z.object({ cursor: z.string().optional(), documents: z.array(z.object({ externalId: z.string().min(1), sourceType: z.string().min(1), title: z.string().min(1), snippet: z.string().optional(), deepLink: z.string().url().optional(), content: z.string().optional(), metadata: z.record(z.unknown()).optional(), principals: z.array(z.string()).optional(), sourceVersion: z.string().optional(), sourceUpdatedAt: z.string().datetime().optional() })) });
const citeDto = z.object({ query: z.string().min(1), externalObjectId: z.string().uuid(), purpose: z.string().optional() });

@Controller("connected-search")
@UseGuards(SessionGuard, OrgContextGuard, AuthzGuard)
export class ConnectedSearchController {
  constructor(private readonly service: ConnectedSearchService) {}
  @Get("connectors") @RequirePermission(CAPABILITIES.CONNECTED_SEARCH_MANAGE) list(@Req() r: Ctx) { return this.service.list(r.organizationId); }
  @Post("connectors") @RequirePermission(CAPABILITIES.CONNECTED_SEARCH_MANAGE) connector(@Req() r: Ctx, @Body(new ZodPipe(connectorDto)) b: z.infer<typeof connectorDto>) { return this.service.createConnector(r.organizationId, r.userId, b); }
  @Post("connectors/:id/scopes") @RequirePermission(CAPABILITIES.CONNECTED_SEARCH_MANAGE) scope(@Req() r: Ctx, @Param("id") id: string, @Body(new ZodPipe(scopeDto)) b: z.infer<typeof scopeDto>) { return this.service.addScope(r.organizationId, id, b); }
  @Post("connectors/:id/crawl") @RequirePermission(CAPABILITIES.CONNECTED_SEARCH_MANAGE) crawl(@Req() r: Ctx, @Param("id") id: string, @Body(new ZodPipe(crawlDto)) b: z.infer<typeof crawlDto>) { return this.service.crawl(r.organizationId, id, b.documents, b.cursor); }
  @Post("connectors/:id/invalidate") @RequirePermission(CAPABILITIES.CONNECTED_SEARCH_MANAGE) invalidate(@Req() r: Ctx, @Param("id") id: string) { return this.service.invalidateConnector(r.organizationId, id); }
  @Get() search(@Req() r: Ctx, @Query("q") q: string, @Query("sourceType") sourceType?: string) { return this.service.search(r.organizationId, r.userId, q ?? "", sourceType); }
  @Get("results/:id") detail(@Req() r: Ctx, @Param("id") id: string) { return this.service.detail(r.organizationId, r.userId, id); }
  @Post("citations") cite(@Req() r: Ctx, @Body(new ZodPipe(citeDto)) b: z.infer<typeof citeDto>) { return this.service.cite(r.organizationId, r.userId, b.query, b.externalObjectId, b.purpose); }
}
