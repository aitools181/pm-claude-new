import { Module } from "@nestjs/common";
import { WorkModule } from "../work/work.module.js";
import { IntegrationsModule } from "../integrations/integrations.module.js";
import { ModulesService } from "../modules/modules.service.js";
import { CommunicationsController } from "./communications.controller.js";
import { CommunicationsService } from "./communications.service.js";
import { CommunicationsHookController } from "./communications-hook.controller.js";
@Module({ imports: [WorkModule, IntegrationsModule], controllers: [CommunicationsController, CommunicationsHookController], providers: [CommunicationsService, ModulesService], exports: [CommunicationsService] })
export class CommunicationsModule {}
