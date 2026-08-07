import { Module } from "@nestjs/common";
import { WorkModule } from "../work/work.module.js";
import { DocsModule } from "../docs/docs.module.js";
import { ModulesService } from "../modules/modules.service.js";
import { WhiteboardService } from "./whiteboard.service.js";
import { WhiteboardController } from "./whiteboard.controller.js";

@Module({ imports: [WorkModule, DocsModule], controllers: [WhiteboardController], providers: [ModulesService, WhiteboardService], exports: [WhiteboardService] })
export class WhiteboardModule {}
