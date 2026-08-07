import { Injectable, Logger, Optional } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { MailSettingsService } from "./mail-settings.service.js";

/**
 * Transport boundary. When instance SMTP is configured and enabled, messages are
 * delivered for real; otherwise the development adapter records metadata only, so
 * reset, invite and verification secrets never appear in logs.
 */
@Injectable()
export class MailService {
  private readonly log = new Logger("Mail");
  constructor(@Optional() private readonly settings?: MailSettingsService) {}

  async send(to: string, subject: string, body: string) {
    const deliveryId = randomUUID();
    const transport = this.settings ? await this.settings.transporter() : null;
    if (!transport) {
      this.log.log(`[mail:${deliveryId}] queued (log adapter) to=${to} subject=${JSON.stringify(subject)} bytes=${Buffer.byteLength(body, "utf8")}`);
      return { deliveryId, accepted: true, delivered: false };
    }
    try {
      const envelope = await this.settings!.envelope();
      const info = await transport.sendMail({ ...envelope, to, subject, text: body });
      this.log.log(`[mail:${deliveryId}] sent to=${to} messageId=${info.messageId}`);
      return { deliveryId, accepted: true, delivered: true };
    } catch (e) {
      // Delivery failure must never break the calling flow (invite, reset, verification).
      this.log.error(`[mail:${deliveryId}] delivery failed to=${to}: ${e instanceof Error ? e.message : "unknown error"}`);
      return { deliveryId, accepted: false, delivered: false };
    }
  }
}
