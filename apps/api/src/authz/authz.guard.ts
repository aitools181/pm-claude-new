import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { Request } from "express";
import { AppError } from "@pm/shared";
import { PERMISSION_KEY } from "./require-permission.decorator.js";
import type { Capability } from "./capabilities.js";
import { PermissionResolver } from "./permission-resolver.js";

/** Server-side authorization. Default deny; capabilities come from the resolver. */
@Injectable()
export class AuthzGuard implements CanActivate {
  constructor(private readonly reflector: Reflector, private readonly resolver: PermissionResolver) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const required = this.reflector.get<Capability>(PERMISSION_KEY, ctx.getHandler());
    if (!required) return true;

    const req = ctx.switchToHttp().getRequest<Request & { userId?: string; organizationId?: string }>();
    if (!req.userId || !req.organizationId) throw new AppError("FORBIDDEN", "No context");
    const projectId = (req.params?.projectId ?? req.params?.id) as string | undefined;

    if (!(await this.resolver.can(req.organizationId, req.userId, required, projectId))) {
      throw new AppError("FORBIDDEN", "Insufficient permission");
    }
    return true;
  }
}
