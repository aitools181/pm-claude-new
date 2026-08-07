import { Module } from "@nestjs/common";
import { BacklogService } from "./backlog.service.js";
import { SprintService } from "./sprint.service.js";
import { AgileMetricsService } from "./metrics.service.js";
import { ReleaseService } from "./release.service.js";
import { AgileController } from "./agile.controller.js";

@Module({ controllers: [AgileController], providers: [BacklogService, SprintService, AgileMetricsService, ReleaseService], exports: [SprintService] })
export class AgileModule {}
