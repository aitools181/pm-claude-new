import { Global, Module } from "@nestjs/common";
import { PlatformAdminService } from "./platform-admin.service.js";
import { PlatformAdminController } from "./platform-admin.controller.js";
import { PlatformAdminGuard } from "./platform-admin.guard.js";

@Global()
@Module({ controllers: [PlatformAdminController], providers: [PlatformAdminService, PlatformAdminGuard], exports: [PlatformAdminService] })
export class PlatformAdminModule {}
