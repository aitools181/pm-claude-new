import { pgTable, uuid, text, boolean, timestamp, jsonb, uniqueIndex, index, date } from "drizzle-orm/pg-core";
import { organizations, users } from "./identity.js";

/* ============================================================
 * X02 — Onboarding, In-Product Guidance, Help Centre & Adoption
 * ============================================================ */

/** I.2.1.4 — per-role progress checklist. One row per user; items is a map
 *  of item-key -> ISO-completed-at (absent/undefined = not done). Dismissible
 *  and resumable, so state lives here rather than derived at read time. */
export const onboardingProgress = pgTable("onboarding_progress", {
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  userId: uuid("user_id").notNull().references(() => users.id),
  items: jsonb("items").default({}).notNull(), // { [itemKey]: isoTimestamp }
  dismissed: boolean("dismissed").default(false).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({ pk: uniqueIndex("onboarding_progress_pk").on(t.organizationId, t.userId) }));

/** I.2.2.2 — feature spotlight: max one per session enforced client-side;
 *  this table is the durable "seen"/"permanently dismissed" record. */
export const featureSpotlightsSeen = pgTable("feature_spotlights_seen", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  userId: uuid("user_id").notNull().references(() => users.id),
  spotlightKey: text("spotlight_key").notNull(),
  seenAt: timestamp("seen_at", { withTimezone: true }).defaultNow().notNull(),
  dismissedPermanently: boolean("dismissed_permanently").default(false).notNull(),
}, (t) => ({ uniq: uniqueIndex("spotlight_seen_unique").on(t.organizationId, t.userId, t.spotlightKey) }));

/** I.2.4.3 — self-hosted telemetry, default OFF, per-category opt-in/out. */
export const telemetrySettings = pgTable("telemetry_settings", {
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  category: text("category").notNull(), // usage|performance|errors
  enabled: boolean("enabled").default(false).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  updatedByUserId: uuid("updated_by_user_id").references(() => users.id),
}, (t) => ({ pk: uniqueIndex("telemetry_settings_pk").on(t.organizationId, t.category) }));

/** I.2.4.1 — lightweight feature-usage counters for the activation funnel and
 *  unused-module report. Content text is never recorded here — only that a
 *  feature/module fired, when, and by whom (for distinct-user counts). */
export const featureUsageEvents = pgTable("feature_usage_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  userId: uuid("user_id").notNull().references(() => users.id),
  feature: text("feature").notNull(), // e.g. "task_created", "module:agile", "invite_sent"
  occurredOn: date("occurred_on").notNull(), // day granularity — enough for a funnel/report, minimal storage
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  byFeatureDay: index("feature_usage_feature_day_idx").on(t.organizationId, t.feature, t.occurredOn),
}));
