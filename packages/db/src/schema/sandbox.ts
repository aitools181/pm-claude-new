import { pgTable, uuid, text, timestamp, jsonb, integer, boolean, index, uniqueIndex } from "drizzle-orm/pg-core";
import { organizations, users } from "./identity.js";

export const sandboxEnvironments = pgTable("sandbox_environments", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  sandboxOrganizationId: uuid("sandbox_organization_id").notNull().references(() => organizations.id),
  name: text("name").notNull(),
  mode: text("mode").default("configuration_only").notNull(),
  status: text("status").default("active").notNull(),
  label: text("label").default("SANDBOX").notNull(),
  integrationsRestricted: boolean("integrations_restricted").default(true).notNull(),
  emailSuppressed: boolean("email_suppressed").default(true).notNull(),
  maskedSampleData: boolean("masked_sample_data").default(false).notNull(),
  createdByUserId: uuid("created_by_user_id").notNull().references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({ unique: uniqueIndex("sandbox_environments_org_name_unique").on(t.organizationId, t.name) }));

export const configurationPackages = pgTable("configuration_packages", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  sandboxId: uuid("sandbox_id").references(() => sandboxEnvironments.id),
  name: text("name").notNull(),
  description: text("description"),
  status: text("status").default("draft").notNull(),
  createdByUserId: uuid("created_by_user_id").notNull().references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({ byOrg: index("configuration_packages_org_idx").on(t.organizationId) }));

export const packageVersions = pgTable("configuration_package_versions", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  packageId: uuid("package_id").notNull().references(() => configurationPackages.id),
  version: integer("version").notNull(),
  manifest: jsonb("manifest").default({}).notNull(),
  payload: jsonb("payload").default({}).notNull(),
  checksum: text("checksum").notNull(),
  signature: text("signature").notNull(),
  createdByUserId: uuid("created_by_user_id").notNull().references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({ unique: uniqueIndex("configuration_package_version_unique").on(t.packageId, t.version) }));

export const environmentDiffs = pgTable("environment_diffs", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  packageVersionId: uuid("package_version_id").notNull().references(() => packageVersions.id),
  targetOrganizationId: uuid("target_organization_id").notNull().references(() => organizations.id),
  additions: jsonb("additions").default([]).notNull(),
  changes: jsonb("changes").default([]).notNull(),
  removals: jsonb("removals").default([]).notNull(),
  conflicts: jsonb("conflicts").default([]).notNull(),
  dependencies: jsonb("dependencies").default([]).notNull(),
  impact: jsonb("impact").default({}).notNull(),
  calculatedAt: timestamp("calculated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({ byVersion: index("environment_diffs_version_idx").on(t.packageVersionId) }));

export const promotionRuns = pgTable("promotion_runs", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  packageVersionId: uuid("package_version_id").notNull().references(() => packageVersions.id),
  targetOrganizationId: uuid("target_organization_id").notNull().references(() => organizations.id),
  status: text("status").default("pending_approval").notNull(),
  scheduledFor: timestamp("scheduled_for", { withTimezone: true }),
  approvedByUserId: uuid("approved_by_user_id").references(() => users.id),
  requestedByUserId: uuid("requested_by_user_id").notNull().references(() => users.id),
  evidence: jsonb("evidence").default({}).notNull(),
  result: jsonb("result").default({}).notNull(),
  startedAt: timestamp("started_at", { withTimezone: true }),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
}, (t) => ({ byTarget: index("promotion_runs_target_idx").on(t.targetOrganizationId, t.status) }));

export const rollbackPackages = pgTable("rollback_packages", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  promotionRunId: uuid("promotion_run_id").notNull().references(() => promotionRuns.id),
  payload: jsonb("payload").default({}).notNull(),
  checksum: text("checksum").notNull(),
  appliedAt: timestamp("applied_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({ unique: uniqueIndex("rollback_packages_run_unique").on(t.promotionRunId) }));
