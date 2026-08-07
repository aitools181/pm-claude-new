import { pgTable, uuid, text, timestamp, jsonb, integer, boolean, doublePrecision, index, uniqueIndex } from "drizzle-orm/pg-core";
import { organizations, users } from "./identity.js";
import { projects, workItems } from "./work.js";
import { integrations } from "./integrations.js";

export const devopsRepositories = pgTable("devops_repositories", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  integrationId: uuid("integration_id").references(() => integrations.id),
  projectId: uuid("project_id").references(() => projects.id),
  provider: text("provider").notNull(),
  externalId: text("external_id").notNull(),
  name: text("name").notNull(),
  url: text("url"),
  isPrivate: boolean("is_private").default(true).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({ unique: uniqueIndex("devops_repositories_unique").on(t.organizationId, t.provider, t.externalId) }));

export const developmentLinks = pgTable("development_links", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  workItemId: uuid("work_item_id").notNull().references(() => workItems.id),
  repositoryId: uuid("repository_id").references(() => devopsRepositories.id),
  kind: text("kind").notNull(), // branch|commit|pull_request|build|deployment|finding
  externalId: text("external_id").notNull(),
  url: text("url"),
  title: text("title"),
  status: text("status"),
  metadata: jsonb("metadata").default({}).notNull(),
  occurredAt: timestamp("occurred_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({ unique: uniqueIndex("development_links_unique").on(t.organizationId, t.kind, t.externalId, t.workItemId), byItem: index("development_links_item_idx").on(t.workItemId) }));

export const pullRequests = pgTable("devops_pull_requests", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  repositoryId: uuid("repository_id").notNull().references(() => devopsRepositories.id),
  externalId: text("external_id").notNull(),
  title: text("title").notNull(),
  url: text("url"),
  author: text("author"),
  status: text("status").notNull(),
  reviewers: jsonb("reviewers").default([]).notNull(),
  openedAt: timestamp("opened_at", { withTimezone: true }),
  mergedAt: timestamp("merged_at", { withTimezone: true }),
  raw: jsonb("raw").default({}).notNull(),
}, (t) => ({ unique: uniqueIndex("devops_pull_requests_unique").on(t.repositoryId, t.externalId) }));

export const devopsBuilds = pgTable("devops_builds", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  repositoryId: uuid("repository_id").references(() => devopsRepositories.id),
  externalId: text("external_id").notNull(),
  status: text("status").notNull(),
  branch: text("branch"),
  commitSha: text("commit_sha"),
  qualityGate: text("quality_gate"),
  durationSeconds: integer("duration_seconds"),
  artifactUrl: text("artifact_url"),
  startedAt: timestamp("started_at", { withTimezone: true }),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
  raw: jsonb("raw").default({}).notNull(),
}, (t) => ({ unique: uniqueIndex("devops_builds_unique").on(t.organizationId, t.externalId) }));

export const devopsEnvironments = pgTable("devops_environments", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  projectId: uuid("project_id").references(() => projects.id),
  name: text("name").notNull(),
  environmentType: text("environment_type").default("production").notNull(),
  protected: boolean("protected").default(false).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({ unique: uniqueIndex("devops_environments_unique").on(t.organizationId, t.projectId, t.name) }));

export const deployments = pgTable("devops_deployments", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  repositoryId: uuid("repository_id").references(() => devopsRepositories.id),
  environmentId: uuid("environment_id").references(() => devopsEnvironments.id),
  externalId: text("external_id").notNull(),
  version: text("version"),
  status: text("status").notNull(),
  commitSha: text("commit_sha"),
  approvedByUserId: uuid("approved_by_user_id").references(() => users.id),
  rollbackOfId: uuid("rollback_of_id"),
  changeSet: jsonb("change_set").default([]).notNull(),
  deployedAt: timestamp("deployed_at", { withTimezone: true }),
  raw: jsonb("raw").default({}).notNull(),
}, (t) => ({ unique: uniqueIndex("devops_deployments_unique").on(t.organizationId, t.externalId), byEnvironment: index("devops_deployments_environment_idx").on(t.environmentId, t.deployedAt) }));

export const engineeringFeatureFlags = pgTable("engineering_feature_flags", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  projectId: uuid("project_id").references(() => projects.id),
  externalId: text("external_id").notNull(),
  name: text("name").notNull(),
  status: text("status").notNull(),
  environments: jsonb("environments").default([]).notNull(),
  url: text("url"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({ unique: uniqueIndex("engineering_feature_flags_unique").on(t.organizationId, t.externalId) }));

export const securityFindings = pgTable("devops_security_findings", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  repositoryId: uuid("repository_id").references(() => devopsRepositories.id),
  externalId: text("external_id").notNull(),
  severity: text("severity").notNull(),
  title: text("title").notNull(),
  status: text("status").default("open").notNull(),
  url: text("url"),
  discoveredAt: timestamp("discovered_at", { withTimezone: true }),
  raw: jsonb("raw").default({}).notNull(),
}, (t) => ({ unique: uniqueIndex("devops_security_findings_unique").on(t.organizationId, t.externalId) }));

export const devMetricSnapshots = pgTable("dev_metric_snapshots", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  projectId: uuid("project_id").references(() => projects.id),
  periodStart: timestamp("period_start", { withTimezone: true }).notNull(),
  periodEnd: timestamp("period_end", { withTimezone: true }).notNull(),
  deploymentFrequency: doublePrecision("deployment_frequency"),
  leadTimeHours: doublePrecision("lead_time_hours"),
  changeFailureRate: doublePrecision("change_failure_rate"),
  restoreTimeHours: doublePrecision("restore_time_hours"),
  reviewTimeHours: doublePrecision("review_time_hours"),
  source: jsonb("source").default({}).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({ byProject: index("dev_metric_snapshots_project_idx").on(t.projectId, t.periodStart) }));

export const devopsWebhookEvents = pgTable("devops_webhook_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  integrationId: uuid("integration_id").references(() => integrations.id),
  provider: text("provider").notNull(),
  eventId: text("event_id").notNull(),
  eventType: text("event_type").notNull(),
  payloadHash: text("payload_hash").notNull(),
  status: text("status").default("processed").notNull(),
  receivedAt: timestamp("received_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({ unique: uniqueIndex("devops_webhook_event_unique").on(t.organizationId, t.provider, t.eventId) }));
