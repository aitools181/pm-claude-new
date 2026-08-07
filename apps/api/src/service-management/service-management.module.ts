import { Module } from "@nestjs/common";
import { WorkModule } from "../work/work.module.js";
import { ModulesService } from "../modules/modules.service.js";
import { ServiceManagementController } from "./service-management.controller.js";
import { ServiceManagementService } from "./service-management.service.js";
@Module({ imports: [WorkModule], controllers: [ServiceManagementController], providers: [ServiceManagementService, ModulesService], exports: [ServiceManagementService] })
export class ServiceManagementModule {}
