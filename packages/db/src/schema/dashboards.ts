import { pgTable, uuid, text, doublePrecision, timestamp, jsonb, boolean, integer, index, uniqueIndex } from "drizzle-orm/pg-core";
import { organizations, users } from "./identity.js";

/* ============================================================
 * DASHBOARDS & METRICS — Phase 9 (definitions, snapshots, widgets)
 * ============================================================ */

/** A metric definition picks a catalogue source + params. The "formula" is these fields. */
export const metricDefinitions = pgTable("metric_definitions", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  key: text("key").notNull(),
  name: text("name").notNull(),
  source: text("source").notNull(),           // catalogue key, e.g. work.done_ratio
  params: jsonb("params").default({}).notNull(),
  unit: text("unit"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({ keyUnique: uniqueIndex("metric_definitions_key_unique").on(t.organizationId, t.key) }));

/** Cached metric value with a freshness timestamp. */
export const metricSnapshots = pgTable("metric_snapshots", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  definitionId: uuid("definition_id").notNull().references(() => metricDefinitions.id),
  value: doublePrecision("value"),
  unit: text("unit"),
  computedAt: timestamp("computed_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({ byDef: uniqueIndex("metric_snapshots_def_unique").on(t.definitionId) }));

export const dashboards = pgTable("dashboards", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  name: text("name").notNull(),
  ownerUserId: uuid("owner_user_id").references(() => users.id),
  visibility: text("visibility").default("org").notNull(),   // private|team|project|org
  scopeId: uuid("scope_id"),                                  // teamId or projectId when visibility is team|project
  widgets: jsonb("widgets").default([]).notNull(),           // [{id,type,title,source,params}]
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({ byOrg: index("dashboards_org_idx").on(t.organizationId) }));

/**
 * F21 — external dashboard share link. Same secure pattern as the discovery
 * roadmap publication: a hashed single-purpose token, optional expiry, and
 * an EXPLICIT widget allow-list so a shared dashboard can never leak a
 * widget the sharer didn't intend to expose (closes the "shared dashboards
 * resist IDOR / expose least data" acceptance requirement).
 */
export const dashboardShares = pgTable("dashboard_shares", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  dashboardId: uuid("dashboard_id").notNull().references(() => dashboards.id),
  tokenHash: text("token_hash").notNull(),
  widgetIds: jsonb("widget_ids").default([]).notNull(), // string[] — explicit allow-list, never "all"
  active: boolean("active").default(true).notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  viewCount: integer("view_count").default(0).notNull(),
  createdByUserId: uuid("created_by_user_id").references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({ byToken: uniqueIndex("dashboard_shares_token_unique").on(t.tokenHash) }));
