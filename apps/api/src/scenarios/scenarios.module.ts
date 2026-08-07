import { Module } from "@nestjs/common";
import { ModulesService } from "../modules/modules.service.js";
import { ScenariosController } from "./scenarios.controller.js";
import { ScenariosService } from "./scenarios.service.js";
@Module({ controllers: [ScenariosController], providers: [ScenariosService, ModulesService], exports: [ScenariosService] })
export class ScenariosModule {}
