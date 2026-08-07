import { Module } from "@nestjs/common";
import { ModulesService } from "../modules/modules.service.js";
import { CalculationsController } from "./calculations.controller.js";
import { CalculationsService } from "./calculations.service.js";
@Module({ controllers: [CalculationsController], providers: [CalculationsService, ModulesService], exports: [CalculationsService] })
export class CalculationsModule {}
