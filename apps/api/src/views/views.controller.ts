import { Controller, Get, Query, Req, UseGuards } from "@nestjs/common";
import { Request } from "express";
import { SessionGuard } from "../auth/guards/session.guard.js";
import { OrgContextGuard } from "../org-context/org-context.guard.js";
import { ViewsService } from "./views.service.js";

type Ctx = Request & { userId: string; organizationId: string };

@Controller()
@UseGuards(SessionGuard, OrgContextGuard)
export class ViewsController {
  constructor(private readonly views: ViewsService) {}

  @Get("my-work")
  myWork(@Req() r: Ctx) { return this.views.myWork(r.organizationId, r.userId); }

  @Get("search")
  search(@Req() r: Ctx, @Query("q") q: string) { return this.views.search(r.organizationId, r.userId, (q ?? "").trim()); }
}
