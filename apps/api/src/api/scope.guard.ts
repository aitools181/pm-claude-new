import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { AppError } from "@pm/shared";
import { SCOPE_KEY } from "./require-scope.decorator.js";

@Injectable()
export class ScopeGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}
  canActivate(ctx: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<string>(SCOPE_KEY, [ctx.getHandler(), ctx.getClass()]);
    if (!required) return true;
    const req = ctx.switchToHttp().getRequest();
    const scopes: string[] = req.apiScopes ?? [];
    if (!scopes.includes(required)) throw new AppError("FORBIDDEN", `Missing required scope: ${required}`, { code: "insufficient_scope" });
    return true;
  }
}
