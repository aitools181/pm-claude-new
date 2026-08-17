import { Module } from "@nestjs/common";
import { ConfigExportModule } from "../config-export/config-export.module.js";
import { ModulesService } from "../modules/modules.service.js";
import { ModuleEnabledGuard } from "../modules/module-enabled.guard.js";
import { SandboxController } from "./sandbox.controller.js";
import { SandboxService } from "./sandbox.service.js";
@Module({ imports: [ConfigExportModule], controllers: [SandboxController], providers: [SandboxService, ModulesService, ModuleEnabledGuard], exports: [SandboxService] })
export class SandboxModule {}
