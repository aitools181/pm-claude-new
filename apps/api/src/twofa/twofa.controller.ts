import { Body, Controller, Get, Post, Req, UseGuards } from "@nestjs/common";
import { Request } from "express";
import { eq } from "drizzle-orm";
import { Inject } from "@nestjs/common";
import { schema, type Database } from "@pm/db";
import { AppError } from "@pm/shared";
import { ZodPipe } from "../common/zod.pipe.js";
import { SessionGuard } from "../auth/guards/session.guard.js";
import { TwoFactorService } from "./twofa.service.js";
import { codeDto } from "../auth/dto/auth.dto.js";
import { DB } from "../db/db.module.js";

@Controller("2fa")
@UseGuards(SessionGuard)
export class TwoFactorController {
  constructor(
    private readonly twofa: TwoFactorService,
    @Inject(DB) private readonly db: Database,
  ) {}

  @Get("status")
  status(@Req() req: Request & { userId: string }) { return this.twofa.status(req.userId); }

  @Post("enrol")
  async enrol(@Req() req: Request & { userId: string }) {
    const [u] = await this.db.select().from(schema.users).where(eq(schema.users.id, req.userId)).limit(1);
    if (!u) throw new AppError("NOT_FOUND", "User not found");
    return this.twofa.beginEnrol(req.userId, u.email);
  }

  @Post("enrol/confirm")
  confirm(@Req() req: Request & { userId: string }, @Body(new ZodPipe(codeDto)) b: { code: string }) {
    return this.twofa.confirmEnrol(req.userId, b.code);
  }

  @Post("recovery/regenerate")
  regenerate(@Req() req: Request & { userId: string }, @Body(new ZodPipe(codeDto)) b: { code: string }) {
    return this.twofa.regenerateRecoveryCodes(req.userId, b.code);
  }

  @Post("disable")
  disable(@Req() req: Request & { userId: string }, @Body(new ZodPipe(codeDto)) b: { code: string }) {
    return this.twofa.disable(req.userId, b.code).then(() => ({ enabled: false }));
  }
}
