import { Injectable } from "@nestjs/common";

export const WEBHOOK_SENDER = Symbol("WEBHOOK_SENDER");

/** Sends a signed webhook. Throws on non-2xx / network error. */
export interface WebhookSender { send(url: string, headers: Record<string, string>, body: string): Promise<{ status: number }>; }

/** Default (sandbox/dev): succeeds without real network egress. Production binds fetch(). */
@Injectable()
export class LogWebhookSender implements WebhookSender {
  async send(): Promise<{ status: number }> { return { status: 200 }; }
}
