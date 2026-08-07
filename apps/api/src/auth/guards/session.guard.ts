import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";
import { Request } from "express";
import { AppError } from "@pm/shared";
import { SessionService } from "../session.service.js";

/** Authentication: attaches req.userId from the session cookie. */
@Injectable()
export class SessionGuard implements CanActivate {
  constructor(private readonly sessions: SessionService) {}
  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<Request & { userId?: string }>();
    const raw = req.cookies?.["pm_session"];
    if (!raw) throw new AppError("UNAUTHENTICATED", "No session");
    const session = await this.sessions.resolve(raw);
    req.userId = session.userId;
    return true;
  }
}
