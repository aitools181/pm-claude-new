import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { MaintenanceModeService } from "./maintenance-mode.service.js";
import { MaintenanceGuard } from "./maintenance.guard.js";
import { BackupScheduleService } from "./backup-schedule.service.js";
import { RestoreOrchestrator } from "./restore.orchestrator.js";
import { IntegrityService } from "./integrity.service.js";
import { MaintenanceController } from "./maintenance.controller.js";

@Module({
  controllers: [MaintenanceController],
  providers: [
    MaintenanceModeService, BackupScheduleService, RestoreOrchestrator, IntegrityService,
    { provide: APP_GUARD, useClass: MaintenanceGuard }, // global mutation blocking
  ],
  exports: [MaintenanceModeService, BackupScheduleService, RestoreOrchestrator, IntegrityService],
})
export class MaintenanceOpsModule {}
