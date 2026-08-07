import { Module } from "@nestjs/common";
import { WorkModule } from "../work/work.module.js";
import { ModulesService } from "../modules/modules.service.js";
import { MigrationAssistantsController } from "./migration-assistants.controller.js";
import { MigrationAssistantsService } from "./migration-assistants.service.js";
@Module({ imports: [WorkModule], controllers: [MigrationAssistantsController], providers: [MigrationAssistantsService, ModulesService], exports: [MigrationAssistantsService] })
export class MigrationAssistantsModule {}
