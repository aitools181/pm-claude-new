import { Injectable } from "@nestjs/common";
import { MailService } from "../mail/mail.service.js";

export const DELIVERER = Symbol("DELIVERER");

/** Delivers a generated report to recipients. Throws on any delivery failure. */
export interface Deliverer { deliver(recipients: string[], subject: string, content: string): Promise<void>; }

/**
 * Production-capable report delivery through the platform SMTP boundary.
 * Unlike the old log/no-op adapter, a missing or failed SMTP transport is not
 * recorded as a successful report delivery.
 */
@Injectable()
export class MailReportDeliverer implements Deliverer {
  constructor(private readonly mail: MailService) {}

  async deliver(recipients: string[], subject: string, content: string): Promise<void> {
    if (!recipients.length) throw new Error("Report has no recipients");
    const failures: string[] = [];
    for (const recipient of recipients) {
      const result = await this.mail.send(recipient, subject, content);
      if (!result.accepted || !result.delivered) failures.push(recipient);
    }
    if (failures.length) throw new Error(`Report delivery unavailable for: ${failures.join(", ")}`);
  }
}
