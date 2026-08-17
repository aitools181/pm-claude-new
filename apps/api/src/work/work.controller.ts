import { UseInterceptors, Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UseGuards } from "@nestjs/common";
import { Request } from "express";
import { z } from "zod";
import { ZodPipe } from "../common/zod.pipe.js";
import { SessionGuard } from "../auth/guards/session.guard.js";
import { OrgContextGuard } from "../org-context/org-context.guard.js";
import { AuthzGuard } from "../authz/authz.guard.js";
import { RequirePermission } from "../authz/require-permission.decorator.js";
import { IdempotencyInterceptor } from "../api/idempotency.interceptor.js";
import { CAPABILITIES } from "../authz/capabilities.js";
import { WorkspacesService } from "./workspaces.service.js";
import { ProjectsService } from "./projects.service.js";
import { WorkItemsService } from "./work-items.service.js";
import { createWorkspaceDto, createProjectDto, createWorkItemDto, createSubtaskDto, updateWorkItemDto } from "./dto.js";
import { WorkItemDetailsService } from "./work-item-details.service.js";
import { AutoAssignService, type AutoAssignStrategy } from "./auto-assign.service.js";

type Ctx = Request & { userId: string; organizationId: string };

@Controller()
@UseGuards(SessionGuard, OrgContextGuard, AuthzGuard)
export class WorkController {
  constructor(
    private readonly workspaces: WorkspacesService,
    private readonly projects: ProjectsService,
    private readonly items: WorkItemsService,
    private readonly details: WorkItemDetailsService,
    private readonly autoAssign: AutoAssignService,
  ) {}

  // ---- Workspaces ----
  @Post("workspaces") @RequirePermission(CAPABILITIES.WORKSPACE_CREATE)
  createWorkspace(@Req() r: Ctx, @Body(new ZodPipe(createWorkspaceDto)) b: { name: string }) {
    return this.workspaces.create(r.organizationId, r.userId, b.name);
  }

  @Get("workspaces")
  listWorkspaces(@Req() r: Ctx) { return this.workspaces.list(r.organizationId); }

  // ---- Projects ----
  @Post("projects") @RequirePermission(CAPABILITIES.PROJECT_CREATE)
  createProject(@Req() r: Ctx, @Body(new ZodPipe(createProjectDto)) b: z.infer<typeof createProjectDto>) {
    return this.projects.create(r.organizationId, r.userId, b);
  }

  @Get("projects")
  listProjects(@Req() r: Ctx, @Query("workspaceId") workspaceId?: string) {
    return this.projects.list(r.organizationId, r.userId, workspaceId);
  }

  @Get("projects/:id")
  async getProject(@Req() r: Ctx, @Param("id") id: string) {
    return this.projects.assertAccess(r.organizationId, id, r.userId);
  }


  @Patch("projects/:id") @RequirePermission(CAPABILITIES.PROJECT_MANAGE)
  async updateProject(@Req() r: Ctx, @Param("id") id: string, @Body(new ZodPipe(z.object({
    version: z.number().int().nonnegative(),
    patch: z.object({
      name: z.string().trim().min(1).max(200).optional(), status: z.enum(["active","on_hold","completed","archived"]).optional(),
      health: z.enum(["on_track","at_risk","off_track"]).optional(), privacy: z.enum(["workspace","private"]).optional(),
      description: z.string().nullable().optional(), color: z.string().max(40).optional(), icon: z.string().trim().min(1).max(40).optional(),
      startDate: z.string().nullable().optional(), dueDate: z.string().nullable().optional(),
      wipLimits: z.record(z.object({ limit: z.number().int().min(1).max(999), warnOnly: z.boolean() })).nullable().optional(),
    }),
  }))) b: { version: number; patch: any }) {
    await this.projects.assertAccess(r.organizationId, id, r.userId);
    return this.projects.update(r.organizationId, id, r.userId, b.patch, b.version);
  }

  @Delete("projects/:id") @RequirePermission(CAPABILITIES.PROJECT_MANAGE)
  deleteProject(@Req() r: Ctx, @Param("id") id: string) {
    return this.projects.softDelete(r.organizationId, id, r.userId).then(() => ({ ok: true }));
  }

  @Post("projects/:id/duplicate") @RequirePermission(CAPABILITIES.PROJECT_CREATE)
  duplicateProject(@Req() r: Ctx, @Param("id") id: string, @Body(new ZodPipe(z.object({ name: z.string().trim().min(1).max(200).optional() }))) b: { name?: string }) {
    return this.projects.duplicate(r.organizationId, r.userId, id, b.name);
  }

  // ---- Work items ----
  @Post("work-items") @RequirePermission(CAPABILITIES.WORKITEM_CREATE) @UseInterceptors(IdempotencyInterceptor)
  async createItem(@Req() r: Ctx, @Body(new ZodPipe(createWorkItemDto)) b: z.infer<typeof createWorkItemDto>) {
    await this.projects.assertAccess(r.organizationId, b.projectId, r.userId);
    return this.items.create(r.organizationId, r.userId, b);
  }

  @Post("work-items/:id/subtasks") @RequirePermission(CAPABILITIES.WORKITEM_CREATE) @UseInterceptors(IdempotencyInterceptor)
  async createSubtask(@Req() r: Ctx, @Param("id") parentId: string, @Body(new ZodPipe(createSubtaskDto)) b: z.infer<typeof createSubtaskDto>) {
    await this.items.assertAccess(r.organizationId, parentId, r.userId);
    const parent = await this.items.get(r.organizationId, parentId);
    return this.items.create(r.organizationId, r.userId, {
      ...b,
      projectId: parent.owningProjectId,
      typeKey: "subtask",
      parentId,
    });
  }

  @Get("projects/:projectId/work-items")
  async listItems(@Req() r: Ctx, @Param("projectId") projectId: string, @Query("limit") limit?: string, @Query("offset") offset?: string) {
    await this.projects.assertAccess(r.organizationId, projectId, r.userId);
    return this.items.listByProject(r.organizationId, projectId, { limit: limit ? +limit : undefined, offset: offset ? +offset : undefined });
  }

  @Get("work-items/:id/subtasks")
  async listSubtasks(@Req() r: Ctx, @Param("id") id: string) {
    await this.items.assertAccess(r.organizationId, id, r.userId);
    return this.items.listChildren(r.organizationId, id);
  }

  @Get("work-items/by-key/:key")
  async getItemByKey(@Req() r: Ctx, @Param("key") key: string) {
    const found = await this.items.getByKey(r.organizationId, key);
    await this.items.assertAccess(r.organizationId, found.id, r.userId);
    return found;
  }

  @Get("work-items/:id")
  async getItem(@Req() r: Ctx, @Param("id") id: string) {
    await this.items.assertAccess(r.organizationId, id, r.userId);
    return this.items.get(r.organizationId, id);
  }

  @Patch("work-items/:id") @RequirePermission(CAPABILITIES.WORKITEM_EDIT)
  updateItem(@Req() r: Ctx, @Param("id") id: string, @Body(new ZodPipe(updateWorkItemDto)) b: z.infer<typeof updateWorkItemDto>) {
    return this.items.update(r.organizationId, id, r.userId, b.version, b.patch);
  }

  @Post("work-items/:id/claim") @RequirePermission(CAPABILITIES.WORKITEM_EDIT)
  claim(@Req() r: Ctx, @Param("id") id: string) { return this.items.claim(r.organizationId, id, r.userId); }
  @Post("work-items/:id/unclaim") @RequirePermission(CAPABILITIES.WORKITEM_EDIT)
  unclaim(@Req() r: Ctx, @Param("id") id: string) { return this.items.unclaim(r.organizationId, id, r.userId); }

  @Post("projects/:id/auto-assign/suggest") @RequirePermission(CAPABILITIES.WORKITEM_EDIT)
  suggestAutoAssign(@Req() r: Ctx, @Param("id") id: string, @Body(new ZodPipe(z.object({
    strategy: z.enum(["round_robin", "least_load", "skill_match", "weighted"]),
    candidateUserIds: z.array(z.string().uuid()).min(1).max(100),
    skill: z.string().max(80).optional(),
    weights: z.record(z.number().min(0)).optional(),
  }))) b: { strategy: AutoAssignStrategy; candidateUserIds: string[]; skill?: string; weights?: Record<string, number> }) {
    return this.autoAssign.suggest(r.organizationId, id, b.strategy, b.candidateUserIds, { skill: b.skill, weights: b.weights });
  }

  @Post("work-items/:id/assignees") @RequirePermission(CAPABILITIES.WORKITEM_EDIT)
  assign(@Req() r: Ctx, @Param("id") id: string, @Body(new ZodPipe(z.object({ userId: z.string().uuid() }))) b: { userId: string }) {
    return this.items.assign(r.organizationId, id, r.userId, b.userId).then(() => ({ ok: true }));
  }

  @Delete("work-items/:id/assignees/:userId") @RequirePermission(CAPABILITIES.WORKITEM_EDIT)
  unassign(@Req() r: Ctx, @Param("id") id: string, @Param("userId") uid: string) {
    return this.items.unassign(r.organizationId, id, r.userId, uid).then(() => ({ ok: true }));
  }

  @Delete("work-items/:id") @RequirePermission(CAPABILITIES.WORKITEM_DELETE)
  deleteItem(@Req() r: Ctx, @Param("id") id: string) {
    return this.items.softDelete(r.organizationId, id, r.userId).then(() => ({ ok: true }));
  }

  @Post("work-items/:id/restore") @RequirePermission(CAPABILITIES.WORKITEM_DELETE)
  restoreItem(@Req() r: Ctx, @Param("id") id: string) {
    return this.items.restore(r.organizationId, id, r.userId).then(() => ({ ok: true }));
  }

  @Get("work-items/:id/checklist-items")
  checklistItems(@Req() r: Ctx, @Param("id") id: string) { return this.details.listChecklistItems(r.organizationId, r.userId, id); }

  @Post("work-items/:id/checklist-items") @RequirePermission(CAPABILITIES.WORKITEM_EDIT)
  addChecklistItem(@Req() r: Ctx, @Param("id") id: string, @Body(new ZodPipe(z.object({ text: z.string().trim().min(1).max(1000) }))) b: { text: string }) {
    return this.details.addChecklistItem(r.organizationId, r.userId, id, b.text);
  }

  @Patch("work-items/:id/checklist-items/:itemId") @RequirePermission(CAPABILITIES.WORKITEM_EDIT)
  updateChecklistItem(@Req() r: Ctx, @Param("id") id: string, @Param("itemId") itemId: string, @Body(new ZodPipe(z.object({ text: z.string().trim().min(1).max(1000).optional(), done: z.boolean().optional() }))) b: { text?: string; done?: boolean }) {
    return this.details.updateChecklistItem(r.organizationId, r.userId, id, itemId, b);
  }

  @Delete("work-items/:id/checklist-items/:itemId") @RequirePermission(CAPABILITIES.WORKITEM_EDIT)
  removeChecklistItem(@Req() r: Ctx, @Param("id") id: string, @Param("itemId") itemId: string) {
    return this.details.removeChecklistItem(r.organizationId, r.userId, id, itemId).then(() => ({ ok: true }));
  }

  @Get("work-items/:id/tags")
  tags(@Req() r: Ctx, @Param("id") id: string) { return this.details.listTags(r.organizationId, r.userId, id); }

  @Post("work-items/:id/tags") @RequirePermission(CAPABILITIES.WORKITEM_EDIT)
  addTag(@Req() r: Ctx, @Param("id") id: string, @Body(new ZodPipe(z.object({ name: z.string().trim().min(1).max(100) }))) b: { name: string }) {
    return this.details.addTag(r.organizationId, r.userId, id, b.name);
  }

  @Delete("work-items/:id/tags/:tagId") @RequirePermission(CAPABILITIES.WORKITEM_EDIT)
  removeTag(@Req() r: Ctx, @Param("id") id: string, @Param("tagId") tagId: string) {
    return this.details.removeTag(r.organizationId, r.userId, id, tagId).then(() => ({ ok: true }));
  }

  @Get("work-items/:id/activity")
  async activity(@Req() r: Ctx, @Param("id") id: string) {
    await this.items.assertAccess(r.organizationId, id, r.userId);
    return this.items.activity(r.organizationId, id);
  }
}
