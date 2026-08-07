import { Module } from "@nestjs/common";
import { ApiModule } from "../api/api.module.js";
import { WebhooksModule } from "../webhooks/webhooks.module.js";
import { IntegrationsModule } from "../integrations/integrations.module.js";
import { SecurityAuditService } from "./security-audit.service.js";
import { SecurityController } from "./security.controller.js";

@Module({ imports: [ApiModule, WebhooksModule, IntegrationsModule], controllers: [SecurityController], providers: [SecurityAuditService], exports: [SecurityAuditService] })
export class SecurityModule {}
