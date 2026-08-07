import { Module } from "@nestjs/common";
import { WorkModule } from "../work/work.module.js";
import { TemplatesService } from "./templates.service.js";
import { RecurrenceService } from "./recurrence.service.js";
import { TemplatesController } from "./templates.controller.js";
@Module({ imports: [WorkModule], controllers: [TemplatesController], providers: [TemplatesService, RecurrenceService], exports: [TemplatesService, RecurrenceService] })
export class TemplatesModule {}
