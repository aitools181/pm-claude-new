import { Module } from "@nestjs/common";
import { IntegrationService } from "./integration.service.js";
import { IntegrationsController } from "./integrations.controller.js";

@Module({ controllers: [IntegrationsController], providers: [IntegrationService], exports: [IntegrationService] })
export class IntegrationsModule {}
