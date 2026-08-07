import { Injectable, Inject } from "@nestjs/common";
import { and, desc, eq, lte, sql } from "drizzle-orm";
import { randomBytes } from "node:crypto";
import { schema, type Database } from "@pm/db";
import { AppError } from "@pm/shared";
import { DB } from "../db/db.module.js";
import { WEBHOOK_SENDER, type WebhookSender } from "./webhook-sender.js";
import { signPayload } from "./webhook-signing.js";

const BACKOFF_SECONDS = 30;

@Injectable()
export class WebhookService {
  constructor(@Inject(DB) private readonly db: Database, @Inject(WEBHOOK_SENDER) private readonly sender: WebhookSender) {}

  // ---- subscriptions ----
  create(organizationId: string, userId: string, input: { url: string; events: string[]; secret?: string }) {
    const secret = input.secret ?? `whsec_${randomBytes(24).toString("base64url")}`;
    return this.db.insert(schema.webhookSubscriptions).values({ organizationId, url: input.url, events: input.events, secret, createdByUserId: userId }).returning().then((r) => r[0]);
  }
  async list(organizationId: string) {
    const rows = await this.db.select().from(schema.webhookSubscriptions).where(eq(schema.webhookSubscriptions.organizationId, organizationId)).orderBy(schema.webhookSubscriptions.createdAt);
    return rows.map((r) => ({ id: r.id, url: r.url, events: r.events, active: r.active, secretMasked: `${r.secret.slice(0, 10)}••••`, createdAt: r.createdAt })); // secret masked
  }
  async setActive(organizationId: string, id: string, active: boolean) {
    const [row] = await this.db.update(schema.webhookSubscriptions).set({ active }).where(and(eq(schema.webhookSubscriptions.id, id), eq(schema.webhookSubscriptions.organizationId, organizationId))).returning();
    if (!row) throw new AppError("NOT_FOUND", "Subscription not found");
    return { id: row.id, active: row.active };
  }
  deliveries(organizationId: string, subscriptionId: string) {
    return this.db.select({ id: schema.webhookDeliveries.id, eventType: schema.webhookDeliveries.eventType, status: schema.webhookDeliveries.status, attempt: schema.webhookDeliveries.attempt, responseStatus: schema.webhookDeliveries.responseStatus, error: schema.webhookDeliveries.error, createdAt: schema.webhookDeliveries.createdAt })
      .from(schema.webhookDeliveries).where(and(eq(schema.webhookDeliveries.organizationId, organizationId), eq(schema.webhookDeliveries.subscriptionId, subscriptionId))).orderBy(desc(schema.webhookDeliveries.createdAt));
  }

  // ---- delivery ----
  private async attempt(sub: typeof schema.webhookSubscriptions.$inferSelect, delivery: typeof schema.webhookDeliveries.$inferSelect) {
    const attempt = delivery.attempt + 1;
    const body = JSON.stringify(delivery.payload);
    const ts = Math.floor(Date.now() / 1000);
    const signature = signPayload(sub.secret, ts, delivery.id, body);
    await this.db.update(schema.webhookDeliveries).set({ status: "pending", attempt, signature }).where(eq(schema.webhookDeliveries.id, delivery.id));
    try {
      const res = await this.sender.send(sub.url, { "Content-Type": "application/json", "X-PM-Event": delivery.eventType, "X-PM-Delivery": delivery.id, "X-PM-Timestamp": String(ts), "X-PM-Signature": signature }, body);
      await this.db.update(schema.webhookDeliveries).set({ status: "delivered", responseStatus: res.status, deliveredAt: new Date(), error: null, nextRetryAt: null }).where(eq(schema.webhookDeliveries.id, delivery.id));
      return { deliveryId: delivery.id, status: "delivered", attempt };
    } catch (e) {
      const error = e instanceof Error ? e.message : "delivery failed";
      const willRetry = attempt < delivery.maxAttempts;
      await this.db.update(schema.webhookDeliveries).set({ status: willRetry ? "retry_scheduled" : "failed", error, nextRetryAt: willRetry ? new Date(Date.now() + BACKOFF_SECONDS * 1000 * attempt) : null }).where(eq(schema.webhookDeliveries.id, delivery.id));
      return { deliveryId: delivery.id, status: willRetry ? "retry_scheduled" : "failed", attempt, error };
    }
  }

  /** Emit an event: enqueue + attempt a signed delivery for each matching active subscription. */
  async emit(organizationId: string, eventType: string, payload: object) {
    const subs = await this.db.select().from(schema.webhookSubscriptions).where(and(eq(schema.webhookSubscriptions.organizationId, organizationId), eq(schema.webhookSubscriptions.active, true), sql`${schema.webhookSubscriptions.events} ? ${eventType}`));
    const results = [];
    for (const sub of subs) {
      const [delivery] = await this.db.insert(schema.webhookDeliveries).values({ organizationId, subscriptionId: sub.id, eventType, payload, status: "pending", attempt: 0 }).returning();
      results.push(await this.attempt(sub, delivery));
    }
    return { emitted: results.length, results };
  }

  private async loadDelivery(organizationId: string, deliveryId: string) {
    const [d] = await this.db.select().from(schema.webhookDeliveries).where(and(eq(schema.webhookDeliveries.id, deliveryId), eq(schema.webhookDeliveries.organizationId, organizationId))).limit(1);
    if (!d) throw new AppError("NOT_FOUND", "Delivery not found");
    const [sub] = await this.db.select().from(schema.webhookSubscriptions).where(eq(schema.webhookSubscriptions.id, d.subscriptionId)).limit(1);
    return { d, sub };
  }

  /** Retry a failed/scheduled delivery (respects max attempts). */
  async retry(organizationId: string, deliveryId: string) {
    const { d, sub } = await this.loadDelivery(organizationId, deliveryId);
    if (!["retry_scheduled", "failed"].includes(d.status)) throw new AppError("CONFLICT", `Delivery is ${d.status}`);
    if (d.attempt >= d.maxAttempts) throw new AppError("CONFLICT", "Max attempts reached");
    return this.attempt(sub, d);
  }

  /** Manual replay: re-send the same payload as a brand-new delivery. */
  async replay(organizationId: string, deliveryId: string) {
    const { d, sub } = await this.loadDelivery(organizationId, deliveryId);
    const [fresh] = await this.db.insert(schema.webhookDeliveries).values({ organizationId, subscriptionId: sub.id, eventType: d.eventType, payload: d.payload as object, status: "pending", attempt: 0 }).returning();
    return this.attempt(sub, fresh);
  }

  /** Scheduler: re-attempt deliveries whose retry time has arrived. */
  async retryDue(organizationId: string, now: Date = new Date()) {
    const due = await this.db.select().from(schema.webhookDeliveries).where(and(eq(schema.webhookDeliveries.organizationId, organizationId), eq(schema.webhookDeliveries.status, "retry_scheduled"), lte(schema.webhookDeliveries.nextRetryAt, now)));
    const results = [];
    for (const d of due) { const [sub] = await this.db.select().from(schema.webhookSubscriptions).where(eq(schema.webhookSubscriptions.id, d.subscriptionId)).limit(1); results.push(await this.attempt(sub, d)); }
    return { retried: results.length };
  }
}
