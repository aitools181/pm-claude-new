import { Module } from "@nestjs/common";
import { ApprovalsService } from "./approvals.service.js";
import { ApprovalsController } from "./approvals.controller.js";

@Module({ controllers: [ApprovalsController], providers: [ApprovalsService], exports: [ApprovalsService] })
export class ApprovalsModule {}
