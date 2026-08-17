import { Module } from "@nestjs/common";
import { SecurityLevelsService } from "./security-levels.service.js";
import { SecurityLevelsController } from "./security-levels.controller.js";

@Module({ controllers: [SecurityLevelsController], providers: [SecurityLevelsService], exports: [SecurityLevelsService] })
export class SecurityLevelsModule {}
