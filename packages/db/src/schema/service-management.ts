import { pgTable, uuid, text, timestamp, jsonb, integer, boolean, index, uniqueIndex } from "drizzle-orm/pg-core";
import { organizations, users } from "./identity.js";
import { projects, workItems } from "./work.js";

export const serviceProjects = pgTable("service_projects", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  projectId: uuid("project_id").notNull().references(() => projects.id),
  key: text("key").notNull(),
  name: text("name").notNull(),
  portalEnabled: boolean("portal_enabled").default(true).notNull(),
  customerAccess: text("customer_access").default("invited").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({ unique: uniqueIndex("service_projects_org_key_unique").on(t.organizationId, t.key) }));

export const requestTypes = pgTable("service_request_types", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  serviceProjectId: uuid("service_project_id").notNull().references(() => serviceProjects.id),
  name: text("name").notNull(),
  description: text("description"),
  workItemTypeKey: text("work_item_type_key").default("request").notNull(),
  formSchema: jsonb("form_schema").default([]).notNull(),
  defaultPriority: text("default_priority").default("normal").notNull(),
  active: boolean("active").default(true).notNull(),
}, (t) => ({ byProject: index("service_request_types_project_idx").on(t.serviceProjectId) }));

export const serviceQueues = pgTable("service_queues", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  serviceProjectId: uuid("service_project_id").notNull().references(() => serviceProjects.id),
  name: text("name").notNull(),
  wql: text("wql").notNull(),
  rank: text("rank").notNull(),
  createdByUserId: uuid("created_by_user_id").notNull().references(() => users.id),
}, (t) => ({ unique: uniqueIndex("service_queues_project_name_unique").on(t.serviceProjectId, t.name) }));

export const slaDefinitions = pgTable("sla_definitions", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  serviceProjectId: uuid("service_project_id").notNull().references(() => serviceProjects.id),
  name: text("name").notNull(),
  metric: text("metric").notNull(), // first_response|resolution|custom
  targetMinutes: integer("target_minutes").notNull(),
  startCondition: jsonb("start_condition").default({}).notNull(),
  pauseCondition: jsonb("pause_condition").default({}).notNull(),
  stopCondition: jsonb("stop_condition").default({}).notNull(),
  calendar: jsonb("calendar").default({ timezone: "UTC", weekdays: [1,2,3,4,5], startHour: 9, endHour: 17 }).notNull(),
  version: integer("version").default(1).notNull(),
  active: boolean("active").default(true).notNull(),
}, (t) => ({ byProject: index("sla_definitions_project_idx").on(t.serviceProjectId) }));

export const slaClocks = pgTable("sla_clocks", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  workItemId: uuid("work_item_id").notNull().references(() => workItems.id),
  slaDefinitionId: uuid("sla_definition_id").notNull().references(() => slaDefinitions.id),
  status: text("status").default("running").notNull(),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
  pausedAt: timestamp("paused_at", { withTimezone: true }),
  stoppedAt: timestamp("stopped_at", { withTimezone: true }),
  elapsedMinutes: integer("elapsed_minutes").default(0).notNull(),
  pausedMinutes: integer("paused_minutes").default(0).notNull(),
  breachAt: timestamp("breach_at", { withTimezone: true }),
  history: jsonb("history").default([]).notNull(),
}, (t) => ({ unique: uniqueIndex("sla_clocks_unique").on(t.workItemId, t.slaDefinitionId) }));

export const incidents = pgTable("service_incidents", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  workItemId: uuid("work_item_id").notNull().references(() => workItems.id),
  severity: text("severity").default("sev3").notNull(),
  status: text("status").default("investigating").notNull(),
  commanderUserId: uuid("commander_user_id").references(() => users.id),
  responders: jsonb("responders").default([]).notNull(),
  stakeholderMessage: text("stakeholder_message"),
  timeline: jsonb("timeline").default([]).notNull(),
  postIncidentReview: jsonb("post_incident_review").default({}).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
}, (t) => ({ byOrgStatus: index("service_incidents_status_idx").on(t.organizationId, t.status) }));

export const problems = pgTable("service_problems", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  title: text("title").notNull(),
  status: text("status").default("open").notNull(),
  rootCause: text("root_cause"),
  knownError: text("known_error"),
  relatedIncidentIds: jsonb("related_incident_ids").default([]).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({ byOrg: index("service_problems_org_idx").on(t.organizationId) }));

export const serviceChanges = pgTable("service_changes", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  workItemId: uuid("work_item_id").references(() => workItems.id),
  title: text("title").notNull(),
  changeType: text("change_type").default("normal").notNull(),
  status: text("status").default("draft").notNull(),
  riskScore: integer("risk_score").default(0).notNull(),
  plannedStart: timestamp("planned_start", { withTimezone: true }),
  plannedEnd: timestamp("planned_end", { withTimezone: true }),
  cabApprovals: jsonb("cab_approvals").default([]).notNull(),
  deploymentLinks: jsonb("deployment_links").default([]).notNull(),
  rollbackPlan: text("rollback_plan"),
  createdByUserId: uuid("created_by_user_id").notNull().references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({ byOrgStatus: index("service_changes_status_idx").on(t.organizationId, t.status) }));

export const serviceAlerts = pgTable("service_alerts", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  source: text("source").notNull(),
  externalId: text("external_id").notNull(),
  fingerprint: text("fingerprint").notNull(),
  title: text("title").notNull(),
  severity: text("severity").notNull(),
  status: text("status").default("open").notNull(),
  occurrences: integer("occurrences").default(1).notNull(),
  assignedUserId: uuid("assigned_user_id").references(() => users.id),
  incidentId: uuid("incident_id").references(() => incidents.id),
  acknowledgedAt: timestamp("acknowledged_at", { withTimezone: true }),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).defaultNow().notNull(),
  raw: jsonb("raw").default({}).notNull(),
}, (t) => ({ unique: uniqueIndex("service_alerts_source_external_unique").on(t.organizationId, t.source, t.externalId), byFingerprint: index("service_alerts_fingerprint_idx").on(t.organizationId, t.fingerprint) }));

export const onCallSchedules = pgTable("on_call_schedules", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  name: text("name").notNull(),
  timezone: text("timezone").default("UTC").notNull(),
  rotations: jsonb("rotations").default([]).notNull(),
  escalationPolicy: jsonb("escalation_policy").default([]).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({ unique: uniqueIndex("on_call_schedules_org_name_unique").on(t.organizationId, t.name) }));

export const assetSchemas = pgTable("asset_schemas", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  name: text("name").notNull(),
  objectTypes: jsonb("object_types").default([]).notNull(),
  fieldDefinitions: jsonb("field_definitions").default([]).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({ unique: uniqueIndex("asset_schemas_org_name_unique").on(t.organizationId, t.name) }));

export const configurationItems = pgTable("configuration_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  schemaId: uuid("schema_id").notNull().references(() => assetSchemas.id),
  objectType: text("object_type").notNull(),
  key: text("key").notNull(),
  name: text("name").notNull(),
  status: text("status").default("active").notNull(),
  attributes: jsonb("attributes").default({}).notNull(),
  sensitive: boolean("sensitive").default(false).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({ unique: uniqueIndex("configuration_items_schema_key_unique").on(t.schemaId, t.key), byType: index("configuration_items_type_idx").on(t.organizationId, t.objectType) }));

export const serviceRelations = pgTable("service_relations", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  fromItemId: uuid("from_item_id").notNull().references(() => configurationItems.id),
  toItemId: uuid("to_item_id").notNull().references(() => configurationItems.id),
  relationType: text("relation_type").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({ unique: uniqueIndex("service_relations_unique").on(t.fromItemId, t.toItemId, t.relationType) }));
