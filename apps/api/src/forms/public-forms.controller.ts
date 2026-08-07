import { Body, Controller, Get, Param, Post, Req } from "@nestjs/common";
import { Request } from "express";
import { z } from "zod";
import { ZodPipe } from "../common/zod.pipe.js";
import { FormsService } from "./forms.service.js";
import { SubmissionsService } from "./submissions.service.js";

const publicSubmitDto = z.object({ answers: z.record(z.any()), captchaToken: z.string().optional() });

/** Unauthenticated public form endpoints (token-scoped). */
@Controller("public")
export class PublicFormsController {
  constructor(private readonly forms: FormsService, private readonly subs: SubmissionsService) {}

  @Get("forms/:token") form(@Param("token") token: string) { return this.forms.getByPublicToken(token); }

  @Post("forms/:token/submit")
  submit(@Param("token") token: string, @Req() req: Request, @Body(new ZodPipe(publicSubmitDto)) b: z.infer<typeof publicSubmitDto>) {
    const ip = (req.headers["x-forwarded-for"]?.toString().split(",")[0].trim()) || req.ip || "unknown";
    return this.subs.submitPublic(token, b.answers, ip, b.captchaToken);
  }

  @Get("requests/:ref") requests(@Param("ref") ref: string) { return this.subs.byRequester(ref); }
}
