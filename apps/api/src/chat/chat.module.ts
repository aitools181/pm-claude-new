import { Module } from "@nestjs/common";
import { WorkModule } from "../work/work.module.js";
import { ModulesService } from "../modules/modules.service.js";
import { ChatService } from "./chat.service.js";
import { ChatController } from "./chat.controller.js";

@Module({ imports: [WorkModule], controllers: [ChatController], providers: [ModulesService, ChatService], exports: [ChatService, ModulesService] })
export class ChatModule {}
