import { Module } from "@nestjs/common";
import { AiModule } from "../ai/ai.module.js";
import { WorkModule } from "../work/work.module.js";
import { ModulesService } from "../modules/modules.service.js";
import { AiAgentsController } from "./ai-agents.controller.js";
import { AiAgentsService } from "./ai-agents.service.js";

@Module({ imports: [AiModule, WorkModule], controllers: [AiAgentsController], providers: [AiAgentsService, ModulesService], exports: [AiAgentsService] })
export class AiAgentsModule {}
