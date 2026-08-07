import { pgTable, uuid, text, jsonb, timestamp, boolean, integer, index, uniqueIndex } from "drizzle-orm/pg-core";
import { organizations, users } from "./identity.js";
import { projects } from "./work.js";

/* ============================================================
 * WQL & SCHEMES — v3 F31 (saved queries, screen layouts)
 * ============================================================ */
export const savedQueries = pgTable("saved_queries", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  name: text("name").notNull(),
  wql: text("wql").notNull(),
  createdByUserId: uuid("created_by_user_id").notNull().references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({ byOrg: index("saved_queries_org_idx").on(t.organizationId) }));

/** Field layout per work item type + screen (create/view/edit/quick_create). */
export const screenSchemes = pgTable("screen_schemes", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  typeKey: text("type_key").notNull(),
  screen: text("screen").notNull(),          // create|view|edit|quick_create
  fields: jsonb("fields").default([]).notNull(),  // ordered field keys
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({ uniq: uniqueIndex("screen_schemes_unique").on(t.organizationId, t.typeKey, t.screen) }));


/** Scheduled subscriptions for saved queries. Delivery is handled by the jobs/notification layer. */
export const querySubscriptions = pgTable("query_subscriptions", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  savedQueryId: uuid("saved_query_id").notNull().references(() => savedQueries.id),
  userId: uuid("user_id").notNull().references(() => users.id),
  schedule: text("schedule").default("daily").notNull(),
  channel: text("channel").default("in_app").notNull(),
  onlyWhenChanged: boolean("only_when_changed").default(true).notNull(),
  enabled: boolean("enabled").default(true).notNull(),
  lastResultHash: text("last_result_hash"),
  lastRunAt: timestamp("last_run_at", { withTimezone: true }),
  nextRunAt: timestamp("next_run_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({ unique: uniqueIndex("query_subscriptions_unique").on(t.savedQueryId, t.userId, t.channel), due: index("query_subscriptions_due_idx").on(t.organizationId, t.enabled, t.nextRunAt) }));

/** Reusable Jira-class configuration bundle with immutable versions. */
export const configurationBundles = pgTable("configuration_bundles", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  name: text("name").notNull(),
  description: text("description"),
  status: text("status").default("draft").notNull(),
  currentVersion: integer("current_version").default(0).notNull(),
  createdByUserId: uuid("created_by_user_id").notNull().references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({ unique: uniqueIndex("configuration_bundles_org_name_unique").on(t.organizationId, t.name) }));

export const configurationBundleVersions = pgTable("configuration_bundle_versions", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  bundleId: uuid("bundle_id").notNull().references(() => configurationBundles.id),
  version: integer("version").notNull(),
  snapshot: jsonb("snapshot").default({}).notNull(),
  checksum: text("checksum").notNull(),
  changeSummary: text("change_summary"),
  published: boolean("published").default(false).notNull(),
  createdByUserId: uuid("created_by_user_id").notNull().references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({ unique: uniqueIndex("configuration_bundle_versions_unique").on(t.bundleId, t.version), checksum: index("configuration_bundle_checksum_idx").on(t.organizationId, t.checksum) }));

export const projectConfigurationBindings = pgTable("project_configuration_bindings", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  projectId: uuid("project_id").notNull().references(() => projects.id),
  bundleId: uuid("bundle_id").notNull().references(() => configurationBundles.id),
  bundleVersionId: uuid("bundle_version_id").notNull().references(() => configurationBundleVersions.id),
  appliedByUserId: uuid("applied_by_user_id").notNull().references(() => users.id),
  appliedAt: timestamp("applied_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({ unique: uniqueIndex("project_configuration_binding_unique").on(t.projectId), byBundle: index("project_configuration_binding_bundle_idx").on(t.bundleId) }));
