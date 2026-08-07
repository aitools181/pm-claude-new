import { Module } from "@nestjs/common";
import { WorkModule } from "../work/work.module.js";
import { ImportService } from "./import.service.js";
import { ExportService } from "./export.service.js";
import { PortabilityController } from "./portability.controller.js";
@Module({ imports: [WorkModule], controllers: [PortabilityController], providers: [ImportService, ExportService], exports: [ImportService, ExportService] })
export class PortabilityModule {}
