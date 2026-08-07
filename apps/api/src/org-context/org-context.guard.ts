import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";
import { Request } from "express";
import { AppError } from "@pm/shared";
import { OrgContextService } from "./org-context.service.js";

/**
 * Requires an X-Organization-Id header (the switched org) and verifies the
 * authenticated user is a member. Sets req.organizationId for scoped queries.
 * Runs AFTER SessionGuard.
 */
@Injectable()
export class OrgContextGuard implements CanActivate {
  constructor(private readonly orgCtx: OrgContextService) {}
  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<Request & { userId?: string; organizationId?: string }>();
    const orgId = req.header("x-organization-id");
    if (!req.userId) throw new AppError("UNAUTHENTICATED", "No user");
    if (!orgId) throw new AppError("VALIDATION", "Missing organization context");
    await this.orgCtx.assertMembership(req.userId, orgId);
    req.organizationId = orgId;
    return true;
  }
}
