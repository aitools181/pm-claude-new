import { Module } from "@nestjs/common";
import { ConfigService } from "./config.service.js";
import { ConfigController } from "./config.controller.js";
@Module({ controllers: [ConfigController], providers: [ConfigService], exports: [ConfigService] })
export class ConfigExportModule {}
