import { Module } from "@nestjs/common";
import { WorkflowService } from "./workflow.service.js";
import { WorkModule } from "../work/work.module.js";
import { WorkflowController } from "./workflow.controller.js";
@Module({ imports: [WorkModule], controllers: [WorkflowController], providers: [WorkflowService], exports: [WorkflowService] })
export class WorkflowModule {}
