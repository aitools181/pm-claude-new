import { Module } from "@nestjs/common";
import { DataOpsService } from "./data-ops.service.js";
import { DataOpsController } from "./data-ops.controller.js";

@Module({ controllers: [DataOpsController], providers: [DataOpsService], exports: [DataOpsService] })
export class DataOpsModule {}
