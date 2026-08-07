import { Module } from "@nestjs/common";
import { MetricService } from "./metric.service.js";
import { DashboardService } from "./dashboard.service.js";
import { DashboardsController } from "./dashboards.controller.js";

@Module({ controllers: [DashboardsController], providers: [MetricService, DashboardService], exports: [MetricService, DashboardService] })
export class DashboardsModule {}
