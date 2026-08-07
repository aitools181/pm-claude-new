import { Body, Controller, Delete, Get, Param, Patch, Post, Req, UseGuards } from "@nestjs/common";
import { Request } from "express";
import { z } from "zod";
import { ZodPipe } from "../common/zod.pipe.js";
import { SessionGuard } from "../auth/guards/session.guard.js";
import { OrgContextGuard } from "../org-context/org-context.guard.js";
import { AuthzGuard } from "../authz/authz.guard.js";
import { RequirePermission } from "../authz/require-permission.decorator.js";
import { CAPABILITIES } from "../authz/capabilities.js";
import { WhiteboardService } from "./whiteboard.service.js";

type Ctx = Request & { userId: string; organizationId: string };
const boardDto = z.object({ name: z.string().min(1) });
const elementDto = z.object({ kind: z.enum(["shape", "note", "connector", "frame", "text"]), x: z.number().optional(), y: z.number().optional(), w: z.number().optional(), h: z.number().optional(), data: z.record(z.any()).optional() });
const patchDto = z.object({ x: z.number().optional(), y: z.number().optional(), w: z.number().optional(), h: z.number().optional(), data: z.record(z.any()).optional() });
const toTaskDto = z.object({ projectId: z.string().uuid(), title: z.string().optional() });
const toDocDto = z.object({ title: z.string().optional() });

@Controller("whiteboards")
@UseGuards(SessionGuard, OrgContextGuard, AuthzGuard)
export class WhiteboardController {
  constructor(private readonly svc: WhiteboardService) {}

  @Get() list(@Req() r: Ctx) { return this.svc.listBoards(r.organizationId); }
  @Post() @RequirePermission(CAPABILITIES.WHITEBOARD_USE)
  create(@Req() r: Ctx, @Body(new ZodPipe(boardDto)) b: z.infer<typeof boardDto>) { return this.svc.createBoard(r.organizationId, r.userId, b.name); }
  @Get(":id") get(@Req() r: Ctx, @Param("id") id: string) { return this.svc.getBoard(r.organizationId, id); }
  @Post(":id/elements") @RequirePermission(CAPABILITIES.WHITEBOARD_USE)
  addElement(@Req() r: Ctx, @Param("id") id: string, @Body(new ZodPipe(elementDto)) b: z.infer<typeof elementDto>) { return this.svc.addElement(r.organizationId, id, b); }
  @Patch("elements/:eid") @RequirePermission(CAPABILITIES.WHITEBOARD_USE)
  update(@Req() r: Ctx, @Param("eid") eid: string, @Body(new ZodPipe(patchDto)) b: z.infer<typeof patchDto>) { return this.svc.updateElement(r.organizationId, eid, b); }
  @Delete("elements/:eid") @RequirePermission(CAPABILITIES.WHITEBOARD_USE)
  remove(@Req() r: Ctx, @Param("eid") eid: string) { return this.svc.deleteElement(r.organizationId, eid); }
  @Post("elements/:eid/to-task") @RequirePermission(CAPABILITIES.WHITEBOARD_USE)
  toTask(@Req() r: Ctx, @Param("eid") eid: string, @Body(new ZodPipe(toTaskDto)) b: z.infer<typeof toTaskDto>) { return this.svc.elementToTask(r.organizationId, r.userId, eid, b); }
  @Post("elements/:eid/to-doc") @RequirePermission(CAPABILITIES.WHITEBOARD_USE)
  toDoc(@Req() r: Ctx, @Param("eid") eid: string, @Body(new ZodPipe(toDocDto)) b: z.infer<typeof toDocDto>) { return this.svc.frameToDoc(r.organizationId, r.userId, eid, b); }
}
