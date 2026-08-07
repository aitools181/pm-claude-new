import { Body, Controller, Get, Param, Post, Req, UseGuards } from "@nestjs/common";
import { Request } from "express";
import { z } from "zod";
import { ZodPipe } from "../common/zod.pipe.js";
import { SessionGuard } from "../auth/guards/session.guard.js";
import { OrgContextGuard } from "../org-context/org-context.guard.js";
import { AuthzGuard } from "../authz/authz.guard.js";
import { RequirePermission } from "../authz/require-permission.decorator.js";
import { CAPABILITIES } from "../authz/capabilities.js";
import { WorkflowService } from "./workflow.service.js";

type Ctx = Request & { userId: string; organizationId: string };
const wf = { manage: RequirePermission(CAPABILITIES.WORKFLOW_MANAGE) };
const statusDto = z.object({ key: z.string(), name: z.string(), category: z.enum(["todo", "in_progress", "done"]).optional(), isInitial: z.boolean().optional(), rank: z.number().optional() });
const transDto = z.object({ name: z.string(), fromStatusId: z.string().uuid().nullable().optional(), toStatusId: z.string().uuid() });
const ruleDto = z.object({ ruleType: z.enum(["condition", "validator", "post_action"]), kind: z.string(), config: z.record(z.any()).optional() });

@Controller("workflows")
@UseGuards(SessionGuard, OrgContextGuard, AuthzGuard)
export class WorkflowController {
  constructor(private readonly wf: WorkflowService) {}

  @Get() @RequirePermission(CAPABILITIES.WORKFLOW_MANAGE)
  list(@Req() r: Ctx) { return this.wf.listWorkflows(r.organizationId); }

  @Get(":workflowId") @RequirePermission(CAPABILITIES.WORKFLOW_MANAGE)
  getOne(@Req() r: Ctx, @Param("workflowId") id: string) { return this.wf.getWorkflow(r.organizationId, id); }

  @Get("versions/:versionId/detail") @RequirePermission(CAPABILITIES.WORKFLOW_MANAGE)
  version(@Req() r: Ctx, @Param("versionId") v: string) { return this.wf.getVersion(r.organizationId, v); }

  @Post() @RequirePermission(CAPABILITIES.WORKFLOW_MANAGE)
  create(@Req() r: Ctx, @Body(new ZodPipe(z.object({ name: z.string().min(1) }))) b: { name: string }) { return this.wf.create(r.organizationId, r.userId, b.name); }

  @Post("versions/:versionId/statuses") @RequirePermission(CAPABILITIES.WORKFLOW_MANAGE)
  addStatus(@Req() r: Ctx, @Param("versionId") v: string, @Body(new ZodPipe(statusDto)) b: z.infer<typeof statusDto>) { return this.wf.addStatus(r.organizationId, v, b); }

  @Post("versions/:versionId/transitions") @RequirePermission(CAPABILITIES.WORKFLOW_MANAGE)
  addTransition(@Req() r: Ctx, @Param("versionId") v: string, @Body(new ZodPipe(transDto)) b: z.infer<typeof transDto>) { return this.wf.addTransition(r.organizationId, v, b); }

  @Post("transitions/:transitionId/rules") @RequirePermission(CAPABILITIES.WORKFLOW_MANAGE)
  addRule(@Req() r: Ctx, @Param("transitionId") t: string, @Body(new ZodPipe(ruleDto)) b: z.infer<typeof ruleDto>) { return this.wf.addRule(r.organizationId, t, b.ruleType, b.kind, b.config); }

  @Get("versions/:versionId/validate") @RequirePermission(CAPABILITIES.WORKFLOW_MANAGE)
  validate(@Param("versionId") v: string) { return this.wf.validate(v); }

  @Post("versions/:versionId/publish") @RequirePermission(CAPABILITIES.WORKFLOW_MANAGE)
  publish(@Req() r: Ctx, @Param("versionId") v: string) { return this.wf.publish(r.organizationId, r.userId, v); }

  @Post(":workflowId/versions") @RequirePermission(CAPABILITIES.WORKFLOW_MANAGE)
  branch(@Req() r: Ctx, @Param("workflowId") id: string) { return this.wf.newDraftVersion(r.organizationId, r.userId, id); }

  @Get(":workflowId/migration-preview/:newVersionId") @RequirePermission(CAPABILITIES.WORKFLOW_MANAGE)
  preview(@Param("workflowId") id: string, @Param("newVersionId") v: string) { return this.wf.migrationPreview(id, v); }

  @Post(":workflowId/migrate/:newVersionId") @RequirePermission(CAPABILITIES.WORKFLOW_MANAGE)
  migrate(@Req() r: Ctx, @Param("workflowId") id: string, @Param("newVersionId") v: string, @Body(new ZodPipe(z.object({ mapping: z.record(z.string()).optional() }))) b: { mapping?: Record<string, string> }) { return this.wf.migrate(r.organizationId, id, v, b.mapping).then(() => ({ ok: true })); }

  // ---- runtime (no manage permission; access enforced elsewhere) ----
  @Post(":workflowId/bind/:workItemId")
  bind(@Req() r: Ctx, @Param("workflowId") wfid: string, @Param("workItemId") wi: string) { return this.wf.bindItem(r.organizationId, wfid, wi); }

  @Get("items/:workItemId/actions")
  actions(@Req() r: Ctx, @Param("workItemId") wi: string) { return this.wf.availableActions(r.organizationId, r.userId, wi); }

  @Post("items/:workItemId/transition/:transitionId")
  transition(@Req() r: Ctx, @Param("workItemId") wi: string, @Param("transitionId") t: string) { return this.wf.transition(r.organizationId, r.userId, wi, t); }
}
