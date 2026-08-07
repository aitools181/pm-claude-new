import { pgTable, uuid, text, timestamp, jsonb, integer, boolean, index, uniqueIndex } from "drizzle-orm/pg-core";
import { organizations, users } from "./identity.js";
import { integrations } from "./integrations.js";

export const searchConnectors = pgTable("search_connectors", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  integrationId: uuid("integration_id").references(() => integrations.id),
  kind: text("kind").notNull(),
  name: text("name").notNull(),
  mode: text("mode").default("indexed").notNull(),
  status: text("status").default("active").notNull(),
  scheduleCron: text("schedule_cron"),
  retentionDays: integer("retention_days").default(30).notNull(),
  config: jsonb("config").default({}).notNull(),
  createdByUserId: uuid("created_by_user_id").notNull().references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({ byOrg: index("search_connectors_org_idx").on(t.organizationId) }));

export const connectorScopes = pgTable("connector_scopes", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  connectorId: uuid("connector_id").notNull().references(() => searchConnectors.id),
  externalScopeId: text("external_scope_id").notNull(),
  label: text("label"),
  include: boolean("include").default(true).notNull(),
  rules: jsonb("rules").default({}).notNull(),
}, (t) => ({ unique: uniqueIndex("connector_scopes_unique").on(t.connectorId, t.externalScopeId) }));

export const indexedExternalObjects = pgTable("indexed_external_objects", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  connectorId: uuid("connector_id").notNull().references(() => searchConnectors.id),
  externalId: text("external_id").notNull(),
  sourceType: text("source_type").notNull(),
  title: text("title").notNull(),
  snippet: text("snippet"),
  deepLink: text("deep_link"),
  contentHash: text("content_hash").notNull(),
  metadata: jsonb("metadata").default({}).notNull(),
  stale: boolean("stale").default(false).notNull(),
  sourceUpdatedAt: timestamp("source_updated_at", { withTimezone: true }),
  indexedAt: timestamp("indexed_at", { withTimezone: true }).defaultNow().notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
}, (t) => ({ unique: uniqueIndex("indexed_external_objects_unique").on(t.connectorId, t.externalId), searchIdx: index("indexed_external_objects_search_idx").on(t.organizationId, t.sourceType) }));

export const externalAclSnapshots = pgTable("external_acl_snapshots", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  externalObjectId: uuid("external_object_id").notNull().references(() => indexedExternalObjects.id),
  principals: jsonb("principals").default([]).notNull(),
  sourceVersion: text("source_version"),
  capturedAt: timestamp("captured_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({ unique: uniqueIndex("external_acl_snapshots_unique").on(t.externalObjectId) }));

export const crawlRuns = pgTable("connector_crawl_runs", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  connectorId: uuid("connector_id").notNull().references(() => searchConnectors.id),
  status: text("status").default("running").notNull(),
  cursor: text("cursor"),
  indexed: integer("indexed").default(0).notNull(),
  removed: integer("removed").default(0).notNull(),
  failed: integer("failed").default(0).notNull(),
  errors: jsonb("errors").default([]).notNull(),
  startedAt: timestamp("started_at", { withTimezone: true }).defaultNow().notNull(),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
}, (t) => ({ byConnector: index("crawl_runs_connector_idx").on(t.connectorId, t.startedAt) }));

export const retrievalCitations = pgTable("retrieval_citations", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  userId: uuid("user_id").notNull().references(() => users.id),
  query: text("query").notNull(),
  externalObjectId: uuid("external_object_id").notNull().references(() => indexedExternalObjects.id),
  purpose: text("purpose").default("search").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({ byUser: index("retrieval_citations_user_idx").on(t.organizationId, t.userId, t.createdAt) }));
