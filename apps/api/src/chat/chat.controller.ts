import { Body, Controller, Get, Param, Post, Req, UseGuards } from "@nestjs/common";
import { Request } from "express";
import { z } from "zod";
import { ZodPipe } from "../common/zod.pipe.js";
import { SessionGuard } from "../auth/guards/session.guard.js";
import { OrgContextGuard } from "../org-context/org-context.guard.js";
import { AuthzGuard } from "../authz/authz.guard.js";
import { RequirePermission } from "../authz/require-permission.decorator.js";
import { CAPABILITIES } from "../authz/capabilities.js";
import { ChatService } from "./chat.service.js";
import { ModulesService, OPTIONAL_MODULES, type OptionalModule } from "../modules/modules.service.js";

type Ctx = Request & { userId: string; organizationId: string };
const channelDto = z.object({ kind: z.enum(["channel", "dm"]).optional(), name: z.string().min(1), isPrivate: z.boolean().optional(), retentionDays: z.number().int().positive().optional(), memberIds: z.array(z.string().uuid()).optional() });
const messageDto = z.object({ body: z.string().min(1), parentMessageId: z.string().uuid().optional() });
const toTaskDto = z.object({ projectId: z.string().uuid(), title: z.string().optional() });
const moduleDto = z.object({ module: z.enum(OPTIONAL_MODULES), enabled: z.boolean() });

@Controller()
@UseGuards(SessionGuard, OrgContextGuard, AuthzGuard)
export class ChatController {
  constructor(private readonly chat: ChatService, private readonly modules: ModulesService) {}

  // module toggles (org settings)
  @Get("modules") listModules(@Req() r: Ctx) { return this.modules.list(r.organizationId); }
  @Post("modules") @RequirePermission(CAPABILITIES.ORG_SETTINGS_MANAGE)
  setModule(@Req() r: Ctx, @Body(new ZodPipe(moduleDto)) b: { module: OptionalModule; enabled: boolean }) { return this.modules.setEnabled(r.organizationId, b.module, b.enabled, r.userId); }

  // chat
  @Get("chat/channels") channels(@Req() r: Ctx) { return this.chat.listChannels(r.organizationId, r.userId); }
  @Post("chat/channels") @RequirePermission(CAPABILITIES.CHAT_USE)
  createChannel(@Req() r: Ctx, @Body(new ZodPipe(channelDto)) b: z.infer<typeof channelDto>) { return this.chat.createChannel(r.organizationId, r.userId, b); }
  @Get("chat/channels/:id/messages") messages(@Req() r: Ctx, @Param("id") id: string) { return this.chat.listMessages(r.organizationId, r.userId, id); }
  @Post("chat/channels/:id/messages") @RequirePermission(CAPABILITIES.CHAT_USE)
  post(@Req() r: Ctx, @Param("id") id: string, @Body(new ZodPipe(messageDto)) b: z.infer<typeof messageDto>) { return this.chat.postMessage(r.organizationId, r.userId, id, b); }
  @Post("chat/messages/:id/to-task") @RequirePermission(CAPABILITIES.CHAT_USE)
  toTask(@Req() r: Ctx, @Param("id") id: string, @Body(new ZodPipe(toTaskDto)) b: z.infer<typeof toTaskDto>) { return this.chat.messageToTask(r.organizationId, r.userId, id, b); }
}
