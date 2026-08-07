import { sql } from "drizzle-orm";
import { pgTable, uuid, text, timestamp, jsonb, boolean, index, uniqueIndex } from "drizzle-orm/pg-core";
import { auditColumns } from "./_common.js";
import { organizations, users } from "./identity.js";
import { teams } from "./access.js";

export const identityProviders = pgTable("identity_providers", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  kind: text("kind").notNull(), // saml|oidc
  name: text("name").notNull(),
  issuerUrl: text("issuer_url"),
  metadataUrl: text("metadata_url"),
  clientId: text("client_id"),
  config: jsonb("config").default({}).notNull(),
  status: text("status").default("draft").notNull(), // draft|test|active|error|disabled
  enforcementMode: text("enforcement_mode").default("optional").notNull(), // optional|approved_domains|enforced
  testMode: boolean("test_mode").default(true).notNull(),
  certificateFingerprint: text("certificate_fingerprint"),
  lastHealthAt: timestamp("last_health_at", { withTimezone: true }),
  lastHealthStatus: text("last_health_status"),
  ...auditColumns,
}, (t) => ({ byOrg: index("identity_providers_org_idx").on(t.organizationId), orgName: uniqueIndex("identity_providers_org_name_unique").on(t.organizationId, t.name) }));

export const verifiedDomains = pgTable("verified_domains", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  providerId: uuid("provider_id").references(() => identityProviders.id),
  domain: text("domain").notNull(),
  verificationTokenHash: text("verification_token_hash").notNull(),
  verifiedAt: timestamp("verified_at", { withTimezone: true }),
  claimedByUserId: uuid("claimed_by_user_id").references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({ orgDomain: uniqueIndex("verified_domains_org_domain_unique").on(t.organizationId, t.domain) }));

export const directoryConnectors = pgTable("directory_connectors", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  kind: text("kind").notNull(), // ldap|active_directory|scim
  name: text("name").notNull(),
  config: jsonb("config").default({}).notNull(),
  credentialRef: text("credential_ref"),
  scheduleCron: text("schedule_cron"),
  status: text("status").default("draft").notNull(),
  lastSyncAt: timestamp("last_sync_at", { withTimezone: true }),
  syncCursor: text("sync_cursor"),
  ...auditColumns,
}, (t) => ({ byOrg: index("directory_connectors_org_idx").on(t.organizationId) }));

export const provisioningMappings = pgTable("provisioning_mappings", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  connectorId: uuid("connector_id").notNull().references(() => directoryConnectors.id),
  externalGroup: text("external_group").notNull(),
  targetRoleKey: text("target_role_key"),
  targetTeamId: uuid("target_team_id").references(() => teams.id),
  highRisk: boolean("high_risk").default(false).notNull(),
  approvedByUserId: uuid("approved_by_user_id").references(() => users.id),
  approvedAt: timestamp("approved_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({ unique: uniqueIndex("provisioning_mappings_unique").on(t.connectorId, t.externalGroup, t.targetRoleKey) }));

export const externalIdentities = pgTable("external_identities", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  providerId: uuid("provider_id").references(() => identityProviders.id),
  connectorId: uuid("connector_id").references(() => directoryConnectors.id),
  externalSubject: text("external_subject").notNull(),
  userId: uuid("user_id").references(() => users.id),
  email: text("email"),
  attributes: jsonb("attributes").default({}).notNull(),
  status: text("status").default("active").notNull(),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  providerSubjectUnique: uniqueIndex("external_identities_provider_subject_unique").on(t.organizationId, t.providerId, t.externalSubject).where(sql`${t.providerId} is not null`),
  connectorSubjectUnique: uniqueIndex("external_identities_connector_subject_unique").on(t.organizationId, t.connectorId, t.externalSubject).where(sql`${t.connectorId} is not null`),
  byUser: index("external_identities_user_idx").on(t.organizationId, t.userId),
}));

export const directorySyncRuns = pgTable("directory_sync_runs", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  connectorId: uuid("connector_id").notNull().references(() => directoryConnectors.id),
  mode: text("mode").default("preview").notNull(), // preview|apply
  status: text("status").default("running").notNull(),
  cursorBefore: text("cursor_before"),
  cursorAfter: text("cursor_after"),
  summary: jsonb("summary").default({}).notNull(),
  errors: jsonb("errors").default([]).notNull(),
  startedByUserId: uuid("started_by_user_id").references(() => users.id),
  startedAt: timestamp("started_at", { withTimezone: true }).defaultNow().notNull(),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
}, (t) => ({ byConnector: index("directory_sync_runs_connector_idx").on(t.connectorId, t.startedAt) }));

export const ssoExemptions = pgTable("sso_exemptions", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  userId: uuid("user_id").notNull().references(() => users.id),
  reason: text("reason").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdByUserId: uuid("created_by_user_id").notNull().references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({ unique: uniqueIndex("sso_exemptions_org_user_unique").on(t.organizationId, t.userId) }));

export const breakGlassCodes = pgTable("break_glass_codes", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  userId: uuid("user_id").notNull().references(() => users.id),
  codeHash: text("code_hash").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  usedAt: timestamp("used_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({ byOrgUser: index("break_glass_codes_org_user_idx").on(t.organizationId, t.userId) }));
