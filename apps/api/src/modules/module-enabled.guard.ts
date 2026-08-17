import { SetMetadata, CanActivate, ExecutionContext, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { Request } from "express";
import { AppError } from "@pm/shared";
import { ModulesService } from "./modules.service.js";
import type { OptionalModule } from "./optional-modules.js";

export const REQUIRES_MODULE_KEY = "requiresModule";
/** Marks a controller (or single route) as belonging to an optional module — gated by ModuleEnabledGuard. */
export const RequiresModule = (module: OptionalModule) => SetMetadata(REQUIRES_MODULE_KEY, module);

/**
 * Closes a real gap found during the blueprint acceptance audit: several
 * optional-module controllers (discovery, service-management, ai-agents,
 * sandbox) had no enforcement at all, so disabling the module in Settings
 * did nothing — the API kept working, silently bypassing both the on/off
 * toggle and the plan entitlement it's supposed to gate. Runs after
 * SessionGuard/OrgContextGuard; routes with no @RequiresModule metadata are
 * left untouched (opt-in, so existing non-module controllers are never
 * affected).
 */
@Injectable()
export class ModuleEnabledGuard implements CanActivate {
  constructor(private readonly reflector: Reflector, private readonly modules: ModulesService) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const module = this.reflector.getAllAndOverride<OptionalModule | undefined>(REQUIRES_MODULE_KEY, [ctx.getHandler(), ctx.getClass()]);
    if (!module) return true; // not a module-gated route
    const req = ctx.switchToHttp().getRequest<Request & { organizationId?: string }>();
    if (!req.organizationId) throw new AppError("FORBIDDEN", "No organization context");
    if (!(await this.modules.isEnabled(req.organizationId, module))) {
      throw new AppError("FORBIDDEN", `The ${module.replace(/_/g, " ")} module is not enabled for this organization`, { code: "module_disabled" });
    }
    return true;
  }
}
