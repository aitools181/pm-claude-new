import { Controller, Get, Req, UseGuards } from "@nestjs/common";
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
}
