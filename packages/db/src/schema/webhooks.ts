import { pgTable, uuid, text, integer, timestamp, jsonb, boolean, index } from "drizzle-orm/pg-core";
import { organizations, users } from "./identity.js";

/* ============================================================
 * WEBHOOKS — Phase 11 (subscriptions, signed deliveries, retries)
 * ============================================================ */

export const webhookSubscriptions = pgTable("webhook_subscriptions", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  url: text("url").notNull(),
  secret: text("secret").notNull(),                  // HMAC signing secret
  events: jsonb("events").default([]).notNull(),     // string[] e.g. ["work_item.created"]
  active: boolean("active").default(true).notNull(),
  createdByUserId: uuid("created_by_user_id").notNull().references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({ byOrg: index("webhook_subs_org_idx").on(t.organizationId, t.active) }));

export const webhookDeliveries = pgTable("webhook_deliveries", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  subscriptionId: uuid("subscription_id").notNull().references(() => webhookSubscriptions.id),
  eventType: text("event_type").notNull(),
  payload: jsonb("payload").notNull(),
  status: text("status").default("pending").notNull(), // pending|delivered|failed|retry_scheduled
  attempt: integer("attempt").default(0).notNull(),
  maxAttempts: integer("max_attempts").default(4).notNull(),
  signature: text("signature"),
  responseStatus: integer("response_status"),
  error: text("error"),
  nextRetryAt: timestamp("next_retry_at", { withTimezone: true }),
  deliveredAt: timestamp("delivered_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({ bySub: index("webhook_deliveries_sub_idx").on(t.subscriptionId, t.createdAt), byStatus: index("webhook_deliveries_status_idx").on(t.organizationId, t.status) }));
