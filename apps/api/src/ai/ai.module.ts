import { Module } from "@nestjs/common";
import { WorkModule } from "../work/work.module.js";
import { ModulesService } from "../modules/modules.service.js";
import { AiService } from "./ai.service.js";
import { AiController } from "./ai.controller.js";
import { AI_PROVIDER, MockAiProvider } from "./provider.js";

@Module({
  imports: [WorkModule],
  controllers: [AiController],
  providers: [ModulesService, AiService, MockAiProvider, { provide: AI_PROVIDER, useExisting: MockAiProvider }],
  exports: [AiService],
})
export class AiModule {}
