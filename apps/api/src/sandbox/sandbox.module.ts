import { Module } from "@nestjs/common";
import { ConfigExportModule } from "../config-export/config-export.module.js";
import { ModulesService } from "../modules/modules.service.js";
import { SandboxController } from "./sandbox.controller.js";
import { SandboxService } from "./sandbox.service.js";
@Module({ imports: [ConfigExportModule], controllers: [SandboxController], providers: [SandboxService, ModulesService], exports: [SandboxService] })
export class SandboxModule {}
