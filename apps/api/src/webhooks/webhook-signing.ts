import { createHmac, timingSafeEqual } from "node:crypto";

/** Signature covers timestamp + delivery id + body, so replays and tampering are detectable. */
export function signPayload(secret: string, timestamp: number, deliveryId: string, body: string): string {
  const mac = createHmac("sha256", secret).update(`${timestamp}.${deliveryId}.${body}`).digest("hex");
  return `sha256=${mac}`;
}

/** Verify a signature; also rejects stale timestamps (replay protection). */
export function verifySignature(secret: string, timestamp: number, deliveryId: string, body: string, header: string, toleranceSeconds = 300, now: number = Math.floor(Date.now() / 1000)): boolean {
  if (Math.abs(now - timestamp) > toleranceSeconds) return false; // stale / replayed
  const expected = signPayload(secret, timestamp, deliveryId, body);
  const a = Buffer.from(expected), b = Buffer.from(header);
  return a.length === b.length && timingSafeEqual(a, b);
}
