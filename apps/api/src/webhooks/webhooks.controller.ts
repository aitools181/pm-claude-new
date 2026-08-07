import { Body, Controller, Get, Param, Post, Req, UseGuards } from "@nestjs/common";
import { Request } from "express";
import { z } from "zod";
import { ZodPipe } from "../common/zod.pipe.js";
import { SessionGuard } from "../auth/guards/session.guard.js";
import { OrgContextGuard } from "../org-context/org-context.guard.js";
import { AuthzGuard } from "../authz/authz.guard.js";
import { RequirePermission } from "../authz/require-permission.decorator.js";
import { CAPABILITIES } from "../authz/capabilities.js";
import { WebhookService } from "./webhook.service.js";

type Ctx = Request & { userId: string; organizationId: string };
const subDto = z.object({ url: z.string().url(), events: z.array(z.string()).min(1), secret: z.string().optional() });
const activeDto = z.object({ active: z.boolean() });
const emitDto = z.object({ eventType: z.string().min(1), payload: z.record(z.any()) });

@Controller("webhooks")
@UseGuards(SessionGuard, OrgContextGuard, AuthzGuard)
export class WebhooksController {
  constructor(private readonly svc: WebhookService) {}

  @Get() list(@Req() r: Ctx) { return this.svc.list(r.organizationId); }
  @Post() @RequirePermission(CAPABILITIES.WEBHOOK_MANAGE)
  create(@Req() r: Ctx, @Body(new ZodPipe(subDto)) b: z.infer<typeof subDto>) { return this.svc.create(r.organizationId, r.userId, b); }
  @Post(":id/active") @RequirePermission(CAPABILITIES.WEBHOOK_MANAGE)
  setActive(@Req() r: Ctx, @Param("id") id: string, @Body(new ZodPipe(activeDto)) b: z.infer<typeof activeDto>) { return this.svc.setActive(r.organizationId, id, b.active); }
  @Get(":id/deliveries") deliveries(@Req() r: Ctx, @Param("id") id: string) { return this.svc.deliveries(r.organizationId, id); }

  @Post("emit") @RequirePermission(CAPABILITIES.WEBHOOK_MANAGE)
  emit(@Req() r: Ctx, @Body(new ZodPipe(emitDto)) b: z.infer<typeof emitDto>) { return this.svc.emit(r.organizationId, b.eventType, b.payload); }
  @Post("deliveries/:id/retry") @RequirePermission(CAPABILITIES.WEBHOOK_MANAGE)
  retry(@Req() r: Ctx, @Param("id") id: string) { return this.svc.retry(r.organizationId, id); }
  @Post("deliveries/:id/replay") @RequirePermission(CAPABILITIES.WEBHOOK_MANAGE)
  replay(@Req() r: Ctx, @Param("id") id: string) { return this.svc.replay(r.organizationId, id); }
}
