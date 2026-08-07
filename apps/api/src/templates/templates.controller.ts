import { Body, Controller, Get, Param, Post, Req, UseGuards } from "@nestjs/common";
import { Request } from "express";
import { z } from "zod";
import { ZodPipe } from "../common/zod.pipe.js";
import { SessionGuard } from "../auth/guards/session.guard.js";
import { OrgContextGuard } from "../org-context/org-context.guard.js";
import { AuthzGuard } from "../authz/authz.guard.js";
import { RequirePermission } from "../authz/require-permission.decorator.js";
import { CAPABILITIES } from "../authz/capabilities.js";
import { TemplatesService } from "./templates.service.js";
import { RecurrenceService } from "./recurrence.service.js";

type Ctx = Request & { userId: string; organizationId: string };
const tpl = z.object({ kind: z.string(), name: z.string().min(1), content: z.record(z.any()) });
const inst = z.object({ workspaceId: z.string().uuid(), name: z.string().optional(), keyPrefix: z.string().optional() });
const rec = z.object({ name: z.string(), spec: z.record(z.any()), frequency: z.enum(["daily", "weekly", "monthly"]), interval: z.number().optional(), timezone: z.string().optional(), firstRunAt: z.string() });

@Controller()
@UseGuards(SessionGuard, OrgContextGuard, AuthzGuard)
export class TemplatesController {
  constructor(private readonly templates: TemplatesService, private readonly recurrence: RecurrenceService) {}

  @Get("templates") @RequirePermission(CAPABILITIES.TEMPLATES_MANAGE)
  list(@Req() r: Ctx) { return this.templates.list(r.organizationId); }
  @Post("templates") @RequirePermission(CAPABILITIES.TEMPLATES_MANAGE)
  create(@Req() r: Ctx, @Body(new ZodPipe(tpl)) b: z.infer<typeof tpl>) { return this.templates.create(r.organizationId, r.userId, b.kind, b.name, b.content); }
  @Post("templates/versions/:versionId/publish") @RequirePermission(CAPABILITIES.TEMPLATES_MANAGE)
  publish(@Req() r: Ctx, @Param("versionId") v: string) { return this.templates.publish(r.organizationId, v); }
  @Post("templates/:id/instantiate-project") @RequirePermission(CAPABILITIES.TEMPLATES_MANAGE)
  instantiate(@Req() r: Ctx, @Param("id") id: string, @Body(new ZodPipe(inst)) b: z.infer<typeof inst>) { return this.templates.instantiateProject(r.organizationId, r.userId, id, b); }

  @Get("recurring-rules") @RequirePermission(CAPABILITIES.TEMPLATES_MANAGE)
  listRec(@Req() r: Ctx) { return this.recurrence.list(r.organizationId); }
  @Post("recurring-rules") @RequirePermission(CAPABILITIES.TEMPLATES_MANAGE)
  createRec(@Req() r: Ctx, @Body(new ZodPipe(rec)) b: z.infer<typeof rec>) { return this.recurrence.createRule(r.organizationId, r.userId, b); }
  @Post("recurring-rules/generate") @RequirePermission(CAPABILITIES.TEMPLATES_MANAGE)
  generate(@Req() r: Ctx) { return this.recurrence.generateDue(r.organizationId, new Date()); }
}
