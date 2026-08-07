import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";
import { Request } from "express";
import { AppError } from "@pm/shared";
import { PlatformAdminService } from "./platform-admin.service.js";

/** Instance authority. Runs AFTER SessionGuard; never satisfied by organization roles. */
@Injectable()
export class PlatformAdminGuard implements CanActivate {
  constructor(private readonly platform: PlatformAdminService) {}
  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<Request & { userId?: string }>();
    if (!req.userId) throw new AppError("UNAUTHENTICATED", "No user");
    await this.platform.assertPlatformAdmin(req.userId);
    return true;
  }
}
