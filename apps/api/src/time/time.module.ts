import { Module } from "@nestjs/common";
import { TimerService } from "./timer.service.js";
import { TimeEntriesService } from "./time-entries.service.js";
import { TimesheetService } from "./timesheet.service.js";
import { TimeReportsService } from "./time-reports.service.js";
import { TimeController } from "./time.controller.js";

@Module({
  controllers: [TimeController],
  providers: [TimerService, TimeEntriesService, TimesheetService, TimeReportsService],
  exports: [TimeEntriesService, TimesheetService],
})
export class TimeModule {}
