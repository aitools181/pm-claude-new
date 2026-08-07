import { Module } from "@nestjs/common";
import { ModulesService } from "../modules/modules.service.js";
import { DiscoveryController, PublicDiscoveryController } from "./discovery.controller.js";
import { DiscoveryService } from "./discovery.service.js";
@Module({ controllers: [DiscoveryController, PublicDiscoveryController], providers: [DiscoveryService, ModulesService], exports: [DiscoveryService] })
export class DiscoveryModule {}
