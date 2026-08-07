import { Global, Module } from "@nestjs/common";
import { AuthzGuard } from "./authz.guard.js";
import { PermissionResolver } from "./permission-resolver.js";

@Global()
@Module({ providers: [AuthzGuard, PermissionResolver], exports: [AuthzGuard, PermissionResolver] })
export class AuthzModule {}
