import { Module } from "@nestjs/common";
import type { Env } from "@pm/shared";
import { WorkModule } from "../work/work.module.js";
import { ModulesService } from "../modules/modules.service.js";
import { ENV } from "../config/config.module.js";
import { AiService } from "./ai.service.js";
import { AiController } from "./ai.controller.js";
import { AI_PROVIDER, createAiProvider } from "./provider.js";

@Module({
  imports: [WorkModule],
  controllers: [AiController],
  providers: [
    ModulesService,
    AiService,
    { provide: AI_PROVIDER, inject: [ENV], useFactory: (env: Env) => createAiProvider(env) },
  ],
  exports: [AiService],
})
export class AiModule {}
