import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";
import { Request } from "express";
import { AppError } from "@pm/shared";
import { MaintenanceModeService } from "./maintenance-mode.service.js";

const MUTATIONS = new Set(["POST", "PUT", "PATCH", "DELETE"]);
// Endpoints that must remain usable while in maintenance (to exit it / drive a restore).
const ALLOW = [/^\/api\/v1\/maintenance\//, /^\/api\/v1\/auth\//, /^\/api\/v1\/health/];

/** Blocks every mutation with 503 while maintenance mode is active. Reads pass through. */
@Injectable()
export class MaintenanceGuard implements CanActivate {
  constructor(private readonly maintenance: MaintenanceModeService) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<Request>();
    if (!MUTATIONS.has(req.method)) return true;
    const path = req.originalUrl?.split("?")[0] ?? req.path;
    if (ALLOW.some((re) => re.test(path))) return true;
    if (await this.maintenance.isActive()) {
      throw new AppError("SERVICE_UNAVAILABLE", "The system is in maintenance mode; mutations are temporarily blocked");
    }
    return true;
  }
}
