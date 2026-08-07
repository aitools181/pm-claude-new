import { Module } from "@nestjs/common";
import { ConfigExportModule } from "../config-export/config-export.module.js";
import { WqlService } from "./wql.service.js";
import { WqlController } from "./wql.controller.js";
@Module({ imports: [ConfigExportModule], controllers: [WqlController], providers: [WqlService], exports: [WqlService] })
export class WqlModule {}
