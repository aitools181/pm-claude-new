import { Injectable } from "@nestjs/common";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

export const WEBHOOK_SENDER = Symbol("WEBHOOK_SENDER");

/** Sends a signed webhook. Throws on non-2xx / network error. */
export interface WebhookSender { send(url: string, headers: Record<string, string>, body: string): Promise<{ status: number }>; }

function privateIp(address: string) {
  if (isIP(address) === 4) {
    const [a, b] = address.split(".").map(Number);
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127);
  }
  if (isIP(address) === 6) {
    const v = address.toLowerCase();
    return v === "::1" || v === "::" || v.startsWith("fc") || v.startsWith("fd") || v.startsWith("fe8") || v.startsWith("fe9") || v.startsWith("fea") || v.startsWith("feb");
  }
  return true;
}

async function assertSafeDestination(raw: string) {
  let url: URL;
  try { url = new URL(raw); } catch { throw new Error("Webhook URL is invalid"); }
  if (!(["https:", "http:"].includes(url.protocol))) throw new Error("Webhook URL must use HTTP(S)");
  if (process.env.NODE_ENV === "production" && url.protocol !== "https:") throw new Error("Production webhooks require HTTPS");
  if (url.username || url.password) throw new Error("Webhook URL must not contain credentials");
  const records = await lookup(url.hostname, { all: true, verbatim: true });
  if (!records.length || records.some((record) => privateIp(record.address))) throw new Error("Webhook destination resolves to a private or reserved address");
  return url;
}

/** Real egress adapter with timeout, redirect blocking and basic SSRF protection. */
@Injectable()
export class FetchWebhookSender implements WebhookSender {
  async send(rawUrl: string, headers: Record<string, string>, body: string): Promise<{ status: number }> {
    const url = await assertSafeDestination(rawUrl);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10_000);
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json", ...headers },
        body,
        signal: controller.signal,
        redirect: "error",
      });
      if (!response.ok) throw new Error(`Webhook returned HTTP ${response.status}`);
      return { status: response.status };
    } finally { clearTimeout(timer); }
  }
}
