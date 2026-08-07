import { Controller, Get, Req, UseGuards } from "@nestjs/common";
import { Request } from "express";
import { SessionGuard } from "../auth/guards/session.guard.js";
import { OrgContextGuard } from "./org-context.guard.js";
import { OrgContextService } from "./org-context.service.js";

@Controller("members")
@UseGuards(SessionGuard, OrgContextGuard)
export class MembersController {
  constructor(private readonly orgCtx: OrgContextService) {}
  @Get()
  list(@Req() req: Request & { organizationId: string }) { return this.orgCtx.listMembers(req.organizationId); }
}
