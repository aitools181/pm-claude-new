import { Body, Controller, Get, Param, Post, Put, Query, Req, UseGuards } from "@nestjs/common";
import { Request } from "express";
import { z } from "zod";
import { ZodPipe } from "../common/zod.pipe.js";
import { SessionGuard } from "../auth/guards/session.guard.js";
import { OrgContextGuard } from "../org-context/org-context.guard.js";
import { AuthzGuard } from "../authz/authz.guard.js";
import { RequirePermission } from "../authz/require-permission.decorator.js";
import { CAPABILITIES } from "../authz/capabilities.js";
import { DocumentService } from "./document.service.js";

type Ctx = Request & { userId: string; organizationId: string };
const blockSchema = z.object({ type: z.string(), text: z.string().optional(), refKind: z.string().optional(), refId: z.string().uuid().optional() });
const createDto = z.object({ title: z.string().min(1), workspaceId: z.string().uuid().optional(), parentId: z.string().uuid().optional(), blocks: z.array(blockSchema).optional() });
const saveDto = z.object({ title: z.string().optional(), blocks: z.array(blockSchema) });
const restoreDto = z.object({ version: z.number().int().positive() });
const s2tDto = z.object({ projectId: z.string().uuid(), title: z.string().min(1) });

@Controller()
@UseGuards(SessionGuard, OrgContextGuard, AuthzGuard)
export class DocsController {
  constructor(private readonly svc: DocumentService) {}

  @Get("documents/tree") tree(@Req() r: Ctx, @Query("workspaceId") ws?: string) { return this.svc.tree(r.organizationId, ws); }
  @Get("documents/:id") get(@Req() r: Ctx, @Param("id") id: string) { return this.svc.get(r.organizationId, r.userId, id); }
  @Get("documents/:id/versions") versions(@Req() r: Ctx, @Param("id") id: string) { return this.svc.listVersions(r.organizationId, id); }
  @Get("backlinks") backlinks(@Req() r: Ctx, @Query("targetKind") kind: string, @Query("targetId") targetId: string) { return this.svc.backlinksFor(r.organizationId, kind, targetId); }

  @Post("documents") @RequirePermission(CAPABILITIES.DOC_MANAGE)
  create(@Req() r: Ctx, @Body(new ZodPipe(createDto)) b: z.infer<typeof createDto>) { return this.svc.create(r.organizationId, r.userId, b); }
  @Put("documents/:id") @RequirePermission(CAPABILITIES.DOC_MANAGE)
  save(@Req() r: Ctx, @Param("id") id: string, @Body(new ZodPipe(saveDto)) b: z.infer<typeof saveDto>) { return this.svc.save(r.organizationId, r.userId, id, b); }
  @Post("documents/:id/restore") @RequirePermission(CAPABILITIES.DOC_MANAGE)
  restore(@Req() r: Ctx, @Param("id") id: string, @Body(new ZodPipe(restoreDto)) b: z.infer<typeof restoreDto>) { return this.svc.restore(r.organizationId, r.userId, id, b.version); }
  @Post("documents/:id/selection-to-task") @RequirePermission(CAPABILITIES.DOC_MANAGE)
  s2t(@Req() r: Ctx, @Param("id") id: string, @Body(new ZodPipe(s2tDto)) b: z.infer<typeof s2tDto>) { return this.svc.selectionToTask(r.organizationId, r.userId, id, b); }
}
