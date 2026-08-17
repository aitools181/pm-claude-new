import { Module } from "@nestjs/common";
import { ModulesService } from "../modules/modules.service.js";
import { ModuleEnabledGuard } from "../modules/module-enabled.guard.js";
import { DiscoveryController, PublicDiscoveryController } from "./discovery.controller.js";
import { DiscoveryService } from "./discovery.service.js";
@Module({ controllers: [DiscoveryController, PublicDiscoveryController], providers: [DiscoveryService, ModulesService, ModuleEnabledGuard], exports: [DiscoveryService] })
export class DiscoveryModule {}
