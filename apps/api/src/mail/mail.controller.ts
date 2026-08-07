import { Body, Controller, Get, Post, Req, UseGuards } from "@nestjs/common";
import { Request } from "express";
import { z } from "zod";
import { ZodPipe } from "../common/zod.pipe.js";
import { SessionGuard } from "../auth/guards/session.guard.js";
import { PlatformAdminGuard } from "../platform/platform-admin.guard.js";
import { MailSettingsService } from "./mail-settings.service.js";

type Ctx = Request & { userId: string };
const saveDto = z.object({
  host: z.string().min(1), port: z.number().int().min(1).max(65535), secure: z.boolean(),
  username: z.string().optional().nullable(), password: z.string().optional().nullable(),
  fromName: z.string().min(1).max(80), fromEmail: z.string().email(),
  replyTo: z.string().email().optional().nullable().or(z.literal("")), enabled: z.boolean(),
});
const testDto = z.object({ to: z.string().email() });

/** SMTP is instance configuration, so it lives behind the platform admin guard. */
@Controller("superadmin/mail")
@UseGuards(SessionGuard, PlatformAdminGuard)
export class MailSettingsController {
  constructor(private readonly settings: MailSettingsService) {}
  @Get() get() { return this.settings.get(); }
  @Post() save(@Req() r: Ctx, @Body(new ZodPipe(saveDto)) b: z.infer<typeof saveDto>) { return this.settings.save(r.userId, { ...b, replyTo: b.replyTo || null }); }
  @Post("test") test(@Req() r: Ctx, @Body(new ZodPipe(testDto)) b: z.infer<typeof testDto>) { return this.settings.sendTest(r.userId, b.to); }
}
