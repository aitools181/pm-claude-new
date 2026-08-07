import { pgTable, uuid, text, integer, boolean, jsonb, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { organizations, users } from "./identity.js";

/* ============================================================
 * PLANS & ENTITLEMENTS — platform-managed commercial tiers.
 * Prices are stored in minor units (paise/cents) to avoid float drift.
 * ============================================================ */
export const plans = pgTable("plans", {
  id: uuid("id").primaryKey().defaultRandom(),
  key: text("key").notNull(),                              // free|pro|business|enterprise
  name: text("name").notNull(),
  description: text("description"),
  currency: text("currency").default("INR").notNull(),
  priceMonthly: integer("price_monthly").default(0).notNull(), // minor units
  priceYearly: integer("price_yearly").default(0).notNull(),
  limits: jsonb("limits").default({}).notNull(),           // {maxMembers,maxProjects,maxWorkItems} · null/absent = unlimited
  modules: jsonb("modules").default([]).notNull(),         // optional modules this tier may enable
  isPublic: boolean("is_public").default(true).notNull(),  // shown on the pricing page
  sortOrder: integer("sort_order").default(0).notNull(),
  status: text("status").default("active").notNull(),      // active|retired
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  updatedByUserId: uuid("updated_by_user_id").references(() => users.id),
}, (t) => ({ keyUnique: uniqueIndex("plans_key_unique").on(t.key) }));

/** One active subscription per organization. */
export const organizationPlans = pgTable("organization_plans", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  planKey: text("plan_key").notNull(),
  status: text("status").default("active").notNull(),      // active|trialing|past_due|cancelled
  seats: integer("seats"),                                  // null = use the plan's member limit
  startedAt: timestamp("started_at", { withTimezone: true }).defaultNow().notNull(),
  currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }),
  assignedByUserId: uuid("assigned_by_user_id").references(() => users.id),
}, (t) => ({ orgUnique: uniqueIndex("organization_plans_org_unique").on(t.organizationId) }));
