import { Module } from "@nestjs/common";
import { DashboardsModule } from "../dashboards/dashboards.module.js";
import { PortfoliosModule } from "../portfolios/portfolios.module.js";
import { ReportService } from "./report.service.js";
import { ReportsController } from "./reports.controller.js";
import { DELIVERER, MailReportDeliverer } from "./deliverer.js";

@Module({
  imports: [DashboardsModule, PortfoliosModule],
  controllers: [ReportsController],
  providers: [ReportService, { provide: DELIVERER, useClass: MailReportDeliverer }],
  exports: [ReportService],
})
export class ReportsModule {}
