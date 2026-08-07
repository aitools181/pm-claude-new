import { Body, Controller, Get, Post, Req, UseGuards } from "@nestjs/common";
import { z } from "zod";
import { ZodPipe } from "../common/zod.pipe.js";
import { Request } from "express";
import { SessionGuard } from "../auth/guards/session.guard.js";
import { OrgContextService } from "./org-context.service.js";
import { OrgContextGuard } from "./org-context.guard.js";

@Controller("organizations")
@UseGuards(SessionGuard)
export class OrgContextController {
  constructor(private readonly orgCtx: OrgContextService) {}

  /** Powers the organization switcher. */
  @Get("mine")
  mine(@Req() req: Request & { userId: string }) {
    return this.orgCtx.myOrganizations(req.userId);
  }

  /** Create an additional organization (multi-org). */
  @Post()
  create(@Req() req: Request & { userId: string }, @Body(new ZodPipe(z.object({ name: z.string().trim().min(1).max(200), slug: z.string().trim().min(1).max(80) }))) b: { name: string; slug: string }) {
    return this.orgCtx.createOrganization(req.userId, b);
  }
}
