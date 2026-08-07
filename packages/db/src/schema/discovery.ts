import { pgTable, uuid, text, timestamp, jsonb, integer, doublePrecision, boolean, index, uniqueIndex } from "drizzle-orm/pg-core";
import { organizations, users } from "./identity.js";
import { workItems, projects } from "./work.js";

export const discoveryCustomers = pgTable("discovery_customers", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  name: text("name").notNull(),
  externalRef: text("external_ref"),
  segment: text("segment"),
  weight: doublePrecision("weight").default(1).notNull(),
  consentStatus: text("consent_status").default("unknown").notNull(),
  retentionUntil: timestamp("retention_until", { withTimezone: true }),
  metadata: jsonb("metadata").default({}).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({ byOrg: index("discovery_customers_org_idx").on(t.organizationId) }));

export const ideas = pgTable("discovery_ideas", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  parentIdeaId: uuid("parent_idea_id"),
  kind: text("kind").default("idea").notNull(),
  title: text("title").notNull(),
  description: text("description"),
  status: text("status").default("new").notNull(),
  ownerUserId: uuid("owner_user_id").references(() => users.id),
  impact: doublePrecision("impact").default(0).notNull(),
  confidence: doublePrecision("confidence").default(0).notNull(),
  effort: doublePrecision("effort").default(1).notNull(),
  reach: doublePrecision("reach").default(0).notNull(),
  customerWeight: doublePrecision("customer_weight").default(1).notNull(),
  score: doublePrecision("score").default(0).notNull(),
  tags: jsonb("tags").default([]).notNull(),
  createdByUserId: uuid("created_by_user_id").notNull().references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({ byOrgStatus: index("discovery_ideas_status_idx").on(t.organizationId, t.status) }));

export const insights = pgTable("discovery_insights", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  customerId: uuid("customer_id").references(() => discoveryCustomers.id),
  sourceType: text("source_type").notNull(),
  sourceRef: text("source_ref"),
  title: text("title").notNull(),
  body: text("body").notNull(),
  theme: text("theme"),
  dedupeHash: text("dedupe_hash").notNull(),
  private: boolean("private").default(false).notNull(),
  metadata: jsonb("metadata").default({}).notNull(),
  createdByUserId: uuid("created_by_user_id").notNull().references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({ dedupe: uniqueIndex("discovery_insights_dedupe_unique").on(t.organizationId, t.dedupeHash), byOrg: index("discovery_insights_org_idx").on(t.organizationId, t.createdAt) }));

export const ideaInsights = pgTable("discovery_idea_insights", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  ideaId: uuid("idea_id").notNull().references(() => ideas.id),
  insightId: uuid("insight_id").notNull().references(() => insights.id),
  relevance: doublePrecision("relevance").default(1).notNull(),
}, (t) => ({ unique: uniqueIndex("discovery_idea_insights_unique").on(t.ideaId, t.insightId) }));

export const discoveryVotes = pgTable("discovery_votes", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  ideaId: uuid("idea_id").notNull().references(() => ideas.id),
  userId: uuid("user_id").notNull().references(() => users.id),
  value: integer("value").default(1).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({ unique: uniqueIndex("discovery_votes_unique").on(t.ideaId, t.userId) }));

export const prioritisationFormulas = pgTable("prioritisation_formulas", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  name: text("name").notNull(),
  kind: text("kind").default("rice").notNull(),
  weights: jsonb("weights").default({}).notNull(),
  active: boolean("active").default(true).notNull(),
  createdByUserId: uuid("created_by_user_id").notNull().references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({ unique: uniqueIndex("prioritisation_formulas_org_name_unique").on(t.organizationId, t.name) }));

export const deliveryLinks = pgTable("discovery_delivery_links", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  ideaId: uuid("idea_id").notNull().references(() => ideas.id),
  projectId: uuid("project_id").references(() => projects.id),
  workItemId: uuid("work_item_id").references(() => workItems.id),
  relation: text("relation").default("delivered_by").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({ unique: uniqueIndex("discovery_delivery_links_unique").on(t.ideaId, t.projectId, t.workItemId) }));

export const roadmapPublications = pgTable("roadmap_publications", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  name: text("name").notNull(),
  tokenHash: text("token_hash").notNull(),
  fields: jsonb("fields").default(["title", "status"]).notNull(),
  filters: jsonb("filters").default({}).notNull(),
  version: integer("version").default(1).notNull(),
  active: boolean("active").default(true).notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  viewCount: integer("view_count").default(0).notNull(),
  createdByUserId: uuid("created_by_user_id").notNull().references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({ tokenUnique: uniqueIndex("roadmap_publications_token_unique").on(t.tokenHash) }));
