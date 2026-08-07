import { Body, Controller, Delete, Get, Param, Post, Req, UseGuards } from "@nestjs/common";
import { Request } from "express";
import { z } from "zod";
import { ZodPipe } from "../common/zod.pipe.js";
import { SessionGuard } from "../auth/guards/session.guard.js";
import { OrgContextGuard } from "../org-context/org-context.guard.js";
import { AuthzGuard } from "../authz/authz.guard.js";
import { RequirePermission } from "../authz/require-permission.decorator.js";
import { CAPABILITIES } from "../authz/capabilities.js";
import { BoardService } from "./board.service.js";
import { PlacementsService } from "./placements.service.js";

type Ctx = Request & { userId: string; organizationId: string };
const moveDto = z.object({ workItemId: z.string().uuid(), toStatus: z.string().optional(), beforeId: z.string().uuid().optional(), afterId: z.string().uuid().optional(), expectedVersion: z.number().int().nonnegative() });
const undoDto = z.object({ workItemId: z.string().uuid(), expectedVersion: z.number().int().nonnegative(), previous: z.object({ status: z.string(), rank: z.string().nullable() }) });
const linkDto = z.object({ targetProjectId: z.string().uuid() });

@Controller()
@UseGuards(SessionGuard, OrgContextGuard, AuthzGuard)
export class BoardController {
  constructor(private readonly board: BoardService, private readonly placements: PlacementsService) {}

  @Get("projects/:id/board")
  get(@Req() r: Ctx, @Param("id") id: string) { return this.board.board(r.organizationId, r.userId, id); }

  @Post("projects/:id/board/move") @RequirePermission(CAPABILITIES.WORKITEM_EDIT)
  move(@Req() r: Ctx, @Param("id") id: string, @Body(new ZodPipe(moveDto)) b: z.infer<typeof moveDto>) {
    return this.board.move(r.organizationId, r.userId, id, b.workItemId, b);
  }

  @Post("projects/:id/board/undo") @RequirePermission(CAPABILITIES.WORKITEM_EDIT)
  undo(@Req() r: Ctx, @Param("id") id: string, @Body(new ZodPipe(undoDto)) b: z.infer<typeof undoDto>) {
    return this.board.undo(r.organizationId, r.userId, id, b.workItemId, b.previous, b.expectedVersion).then(() => ({ ok: true }));
  }

  @Post("work-items/:id/links") @RequirePermission(CAPABILITIES.WORKITEM_EDIT)
  link(@Req() r: Ctx, @Param("id") id: string, @Body(new ZodPipe(linkDto)) b: { targetProjectId: string }) {
    return this.placements.link(r.organizationId, r.userId, id, b.targetProjectId);
  }

  @Delete("placements/:id") @RequirePermission(CAPABILITIES.WORKITEM_EDIT)
  unlink(@Req() r: Ctx, @Param("id") id: string) { return this.placements.unlink(r.organizationId, r.userId, id).then(() => ({ ok: true })); }
}
