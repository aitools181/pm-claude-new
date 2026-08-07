import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";
import { AppError } from "@pm/shared";
import { ApiTokenService } from "./api-token.service.js";

/** Authenticates public-API requests via `Authorization: Bearer pmk_...`. */
@Injectable()
export class ApiTokenGuard implements CanActivate {
  constructor(private readonly tokens: ApiTokenService) {}
  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest();
    const header: string = req.headers["authorization"] ?? "";
    const raw = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
    if (!raw) throw new AppError("FORBIDDEN", "Missing API token", { code: "missing_token" });
    const principal = await this.tokens.authenticate(raw);
    req.organizationId = principal.organizationId;
    req.userId = principal.userId;
    req.apiScopes = principal.scopes;
    req.isApiToken = true;
    return true;
  }
}
