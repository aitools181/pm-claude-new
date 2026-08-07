import { Module } from "@nestjs/common";
import { DependenciesService } from "./dependencies.service.js";
import { DependenciesController } from "./dependencies.controller.js";
import { CalendarService } from "../calendar/calendar.service.js";
import { CalendarViewService } from "../calendar/calendar-view.service.js";
import { CalendarController } from "../calendar/calendar.controller.js";

@Module({
  controllers: [DependenciesController, CalendarController],
  providers: [DependenciesService, CalendarService, CalendarViewService],
  exports: [DependenciesService, CalendarService, CalendarViewService],
})
export class PlanningModule {}
