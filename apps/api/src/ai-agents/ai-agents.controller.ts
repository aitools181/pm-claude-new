import { Body, Controller, Delete, Get, Param, Patch, Post, Req, UseGuards } from "@nestjs/common";
import type { Request } from "express";
import { z } from "zod";
import { SessionGuard } from "../auth/guards/session.guard.js";
import { OrgContextGuard } from "../org-context/org-context.guard.js";
import { AuthzGuard } from "../authz/authz.guard.js";
import { RequirePermission } from "../authz/require-permission.decorator.js";
import { CAPABILITIES } from "../authz/capabilities.js";
import { ZodPipe } from "../common/zod.pipe.js";
import { AiAgentsService } from "./ai-agents.service.js";

type Ctx = Request & { userId: string; organizationId: string };
const policy = z.object({ allowedActions: z.array(z.string()).optional(), destructiveActions: z.array(z.string()).optional(), externalSendRequiresCheckpoint: z.boolean().optional(), massMutationLimit: z.number().int().positive().optional(), maxRunTokens: z.number().int().positive().optional(), maxDailyTokens: z.number().int().positive().optional(), retentionDays: z.number().int().positive().optional() });
const teammate = z.object({ name: z.string().min(1), role: z.string().min(1), skills: z.array(z.string()).optional(), allowedProjectIds: z.array(z.string().uuid()).optional(), provider: z.string().optional(), model: z.string().optional(), policy: policy.optional(), tokenLimit: z.number().int().positive().optional(), costLimitMicros: z.number().int().nonnegative().optional() });
const tool = z.object({ toolKey: z.string().min(1), scope: z.record(z.unknown()).optional(), enabled: z.boolean().optional() });
const run = z.object({ task: z.string().min(1), input: z.object({ action: z.string().optional(), query: z.string().optional(), projectId: z.string().uuid().optional(), workItemId: z.string().uuid().optional(), parentId: z.string().uuid().optional(), title: z.string().optional(), description: z.string().optional(), status: z.string().optional(), itemIds: z.array(z.string().uuid()).optional(), payload: z.record(z.unknown()).optional(), remember: z.boolean().optional() }).optional() });
const decision = z.object({ decision: z.enum(["approve", "reject"]), reason: z.string().optional() });
const memory = z.object({ workspaceId: z.string().uuid().optional(), projectId: z.string().uuid().optional(), scopeType: z.string().optional(), memoryKey: z.string().min(1), content: z.string().min(1), sourceRefs: z.array(z.unknown()).optional(), retentionDays: z.number().int().positive().optional() });

@Controller("ai-agents")
@UseGuards(SessionGuard, OrgContextGuard, AuthzGuard)
export class AiAgentsController {
  constructor(private readonly service: AiAgentsService) {}
  @Get() overview(@Req() r: Ctx) { return this.service.overview(r.organizationId); }
  @Post("teammates") @RequirePermission(CAPABILITIES.AI_AGENT_MANAGE) create(@Req() r: Ctx, @Body(new ZodPipe(teammate)) b: z.infer<typeof teammate>) { return this.service.createTeammate(r.organizationId, r.userId, b); }
  @Patch("teammates/:id/policy") @RequirePermission(CAPABILITIES.AI_AGENT_MANAGE) updatePolicy(@Req() r: Ctx, @Param("id") id: string, @Body(new ZodPipe(policy)) b: z.infer<typeof policy>) { return this.service.updatePolicy(r.organizationId, r.userId, id, b); }
  @Post("teammates/:id/tools") @RequirePermission(CAPABILITIES.AI_AGENT_MANAGE) tool(@Req() r: Ctx, @Param("id") id: string, @Body(new ZodPipe(tool)) b: z.infer<typeof tool>) { return this.service.grantTool(r.organizationId, r.userId, id, b); }
  @Post("teammates/:id/runs") run(@Req() r: Ctx, @Param("id") id: string, @Body(new ZodPipe(run)) b: z.infer<typeof run>) { return this.service.startRun(r.organizationId, r.userId, id, b.task, b.input); }
  @Get("runs/:id") runDetail(@Req() r: Ctx, @Param("id") id: string) { return this.service.run(r.organizationId, r.userId, id); }
  @Post("checkpoints/:id/decision") @RequirePermission(CAPABILITIES.AI_AGENT_MANAGE) decide(@Req() r: Ctx, @Param("id") id: string, @Body(new ZodPipe(decision)) b: z.infer<typeof decision>) { return this.service.decideCheckpoint(r.organizationId, r.userId, id, b); }
  @Post("teammates/:id/memories") memory(@Req() r: Ctx, @Param("id") id: string, @Body(new ZodPipe(memory)) b: z.infer<typeof memory>) { return this.service.remember(r.organizationId, r.userId, id, b); }
  @Get("teammates/:id/memories") memories(@Req() r: Ctx, @Param("id") id: string) { return this.service.memories(r.organizationId, r.userId, id); }
  @Delete("memories/:id") deleteMemory(@Req() r: Ctx, @Param("id") id: string) { return this.service.deleteMemory(r.organizationId, r.userId, id); }
  @Post("memories/cleanup") @RequirePermission(CAPABILITIES.AI_AGENT_MANAGE) cleanup(@Req() r: Ctx) { return this.service.cleanupExpiredMemory(r.organizationId); }
}
