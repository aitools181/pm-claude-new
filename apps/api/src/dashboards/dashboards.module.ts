import { Module } from "@nestjs/common";
import { MetricService } from "./metric.service.js";
import { DashboardService } from "./dashboard.service.js";
import { DashboardsController, PublicDashboardsController } from "./dashboards.controller.js";

@Module({ controllers: [DashboardsController, PublicDashboardsController], providers: [MetricService, DashboardService], exports: [MetricService, DashboardService] })
export class DashboardsModule {}
