import { pgTable, uuid, text, timestamp, jsonb, integer, index, uniqueIndex } from "drizzle-orm/pg-core";
import { organizations, users } from "./identity.js";
import { workItems } from "./work.js";

export const migrationProjects = pgTable("migration_projects", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  vendor: text("vendor").notNull(), // asana|jira|clickup
  name: text("name").notNull(),
  sourceMode: text("source_mode").default("export").notNull(),
  status: text("status").default("draft").notNull(),
  sourceConfig: jsonb("source_config").default({}).notNull(),
  createdByUserId: uuid("created_by_user_id").notNull().references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({ byOrg: index("migration_projects_org_idx").on(t.organizationId) }));

export const discoverySnapshots = pgTable("migration_discovery_snapshots", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  migrationProjectId: uuid("migration_project_id").notNull().references(() => migrationProjects.id),
  counts: jsonb("counts").default({}).notNull(),
  supported: jsonb("supported").default([]).notNull(),
  unsupported: jsonb("unsupported").default([]).notNull(),
  sourceChecksum: text("source_checksum").notNull(),
  sample: jsonb("sample").default([]).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({ byProject: index("migration_discovery_project_idx").on(t.migrationProjectId) }));

export const migrationMappingProfiles = pgTable("migration_mapping_profiles", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  migrationProjectId: uuid("migration_project_id").notNull().references(() => migrationProjects.id),
  name: text("name").notNull(),
  mappings: jsonb("mappings").default({}).notNull(),
  version: integer("version").default(1).notNull(),
  createdByUserId: uuid("created_by_user_id").notNull().references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({ byProject: index("migration_mapping_project_idx").on(t.migrationProjectId) }));

export const migrationBatches = pgTable("migration_batches", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  migrationProjectId: uuid("migration_project_id").notNull().references(() => migrationProjects.id),
  mappingProfileId: uuid("mapping_profile_id").references(() => migrationMappingProfiles.id),
  mode: text("mode").default("dry_run").notNull(),
  status: text("status").default("queued").notNull(),
  cursor: integer("cursor").default(0).notNull(),
  chunkSize: integer("chunk_size").default(100).notNull(),
  sourceChecksum: text("source_checksum").notNull(),
  counts: jsonb("counts").default({}).notNull(),
  errors: jsonb("errors").default([]).notNull(),
  result: jsonb("result").default({}).notNull(),
  startedByUserId: uuid("started_by_user_id").notNull().references(() => users.id),
  startedAt: timestamp("started_at", { withTimezone: true }).defaultNow().notNull(),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
}, (t) => ({ byProject: index("migration_batches_project_idx").on(t.migrationProjectId, t.startedAt) }));

export const migrationSourceReferences = pgTable("migration_source_references", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  migrationProjectId: uuid("migration_project_id").notNull().references(() => migrationProjects.id),
  sourceType: text("source_type").notNull(),
  sourceId: text("source_id").notNull(),
  sourceKey: text("source_key"),
  sourceUrl: text("source_url"),
  targetType: text("target_type").notNull(),
  targetId: uuid("target_id"),
  workItemId: uuid("work_item_id").references(() => workItems.id),
  metadata: jsonb("metadata").default({}).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({ unique: uniqueIndex("migration_source_ref_unique").on(t.organizationId, t.migrationProjectId, t.sourceType, t.sourceId), byTarget: index("migration_source_ref_target_idx").on(t.targetType, t.targetId) }));
