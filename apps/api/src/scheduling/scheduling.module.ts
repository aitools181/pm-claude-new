import { Module } from "@nestjs/common";
import { SchedulingService } from "./scheduling.service.js";
import { CascadeService } from "./cascade.service.js";
import { BaselineService } from "./baseline.service.js";
import { SchedulingController } from "./scheduling.controller.js";

@Module({
  controllers: [SchedulingController],
  providers: [SchedulingService, CascadeService, BaselineService],
  exports: [SchedulingService],
})
export class SchedulingModule {}
