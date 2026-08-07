import { Module } from "@nestjs/common";
import { IntegrationsModule } from "../integrations/integrations.module.js";
import { ModulesService } from "../modules/modules.service.js";
import { DevOpsController } from "./devops.controller.js";
import { DevOpsService } from "./devops.service.js";
import { DevOpsHookController } from "./devops-hook.controller.js";
@Module({ imports: [IntegrationsModule], controllers: [DevOpsController, DevOpsHookController], providers: [DevOpsService, ModulesService], exports: [DevOpsService] })
export class DevOpsModule {}
