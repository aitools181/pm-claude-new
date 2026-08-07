import { Injectable, Logger } from "@nestjs/common";
import { randomUUID } from "node:crypto";

/**
 * Transport boundary. The development adapter records metadata only so reset,
 * invite and verification secrets never appear in logs. Replace with SMTP/API
 * delivery in production without changing callers.
 */
@Injectable()
export class MailService {
  private readonly log = new Logger("Mail");

  async send(to: string, subject: string, body: string) {
    const deliveryId = randomUUID();
    this.log.log(`[mail:${deliveryId}] queued to=${to} subject=${JSON.stringify(subject)} bytes=${Buffer.byteLength(body, "utf8")}`);
    return { deliveryId, accepted: true };
  }
}
