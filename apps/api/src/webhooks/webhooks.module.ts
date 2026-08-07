import { Module } from "@nestjs/common";
import { WebhookService } from "./webhook.service.js";
import { WebhooksController } from "./webhooks.controller.js";
import { WEBHOOK_SENDER, LogWebhookSender } from "./webhook-sender.js";

@Module({
  controllers: [WebhooksController],
  providers: [WebhookService, { provide: WEBHOOK_SENDER, useClass: LogWebhookSender }],
  exports: [WebhookService],
})
export class WebhooksModule {}
