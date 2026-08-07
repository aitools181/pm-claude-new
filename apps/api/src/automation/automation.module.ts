import { Module } from "@nestjs/common";
import { AutomationService } from "./automation.service.js";
import { ActionRegistry } from "./action-registry.js";
import { AutomationController } from "./automation.controller.js";
@Module({ controllers: [AutomationController], providers: [AutomationService, ActionRegistry], exports: [AutomationService] })
export class AutomationModule {}
