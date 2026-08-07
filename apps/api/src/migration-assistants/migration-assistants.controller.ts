import { Body, Controller, Get, Param, Post, Req, UseGuards } from "@nestjs/common";
import { Request } from "express";
import { z } from "zod";
import { SessionGuard } from "../auth/guards/session.guard.js";
import { OrgContextGuard } from "../org-context/org-context.guard.js";
import { AuthzGuard } from "../authz/authz.guard.js";
import { RequirePermission } from "../authz/require-permission.decorator.js";
import { CAPABILITIES } from "../authz/capabilities.js";
import { ZodPipe } from "../common/zod.pipe.js";
import { MigrationAssistantsService } from "./migration-assistants.service.js";

type Ctx = Request & { userId: string; organizationId: string };
const createDto = z.object({ vendor: z.enum(["asana", "jira", "clickup"]), name: z.string().min(1), sourceMode: z.enum(["export", "api"]).optional(), sourceConfig: z.record(z.unknown()).optional() });
const sourceDto = z.object({ source: z.record(z.unknown()) });
const mappingDto = z.object({ name: z.string().min(1), mappings: z.record(z.unknown()) });
const runDto = z.object({ mode: z.enum(["dry_run", "apply"]), source: z.record(z.unknown()), mappingProfileId: z.string().uuid().optional(), chunkSize: z.number().int().min(10).max(500).optional(), resumeBatchId: z.string().uuid().optional() });

@Controller("migration-centre")
@UseGuards(SessionGuard, OrgContextGuard, AuthzGuard)
@RequirePermission(CAPABILITIES.MIGRATION_MANAGE)
export class MigrationAssistantsController {
  constructor(private readonly service: MigrationAssistantsService) {}
  @Get() list(@Req() r: Ctx) { return this.service.list(r.organizationId); }
  @Post() create(@Req() r: Ctx, @Body(new ZodPipe(createDto)) b: z.infer<typeof createDto>) { return this.service.create(r.organizationId, r.userId, b); }
  @Post(":id/discover") discover(@Req() r: Ctx, @Param("id") id: string, @Body(new ZodPipe(sourceDto)) b: z.infer<typeof sourceDto>) { return this.service.discover(r.organizationId, id, b.source); }
  @Post(":id/mappings") mapping(@Req() r: Ctx, @Param("id") id: string, @Body(new ZodPipe(mappingDto)) b: z.infer<typeof mappingDto>) { return this.service.saveMapping(r.organizationId, r.userId, id, b); }
  @Post(":id/run") run(@Req() r: Ctx, @Param("id") id: string, @Body(new ZodPipe(runDto)) b: z.infer<typeof runDto>) { return this.service.run(r.organizationId, r.userId, id, b); }
  @Get(":id/validation") validation(@Req() r: Ctx, @Param("id") id: string) { return this.service.validation(r.organizationId, id); }
}
