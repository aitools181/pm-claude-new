import { pgTable, uuid, text, timestamp, jsonb, doublePrecision, boolean, integer, index, uniqueIndex } from "drizzle-orm/pg-core";
import { organizations, users } from "./identity.js";
import { projects, workItems } from "./work.js";

export const personalNotes = pgTable("personal_notes", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  userId: uuid("user_id").notNull().references(() => users.id),
  title: text("title").notNull(),
  body: text("body").default("").notNull(),
  pinned: boolean("pinned").default(false).notNull(),
  shared: boolean("shared").default(false).notNull(),
  retentionUntil: timestamp("retention_until", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({ byUser: index("personal_notes_user_idx").on(t.organizationId, t.userId, t.updatedAt) }));

export const reminders = pgTable("personal_reminders", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  userId: uuid("user_id").notNull().references(() => users.id),
  workItemId: uuid("work_item_id").references(() => workItems.id),
  title: text("title").notNull(),
  dueAt: timestamp("due_at", { withTimezone: true }).notNull(),
  timezone: text("timezone").default("UTC").notNull(),
  recurrence: text("recurrence"),
  status: text("status").default("open").notNull(),
  snoozedUntil: timestamp("snoozed_until", { withTimezone: true }),
  delegatedToUserId: uuid("delegated_to_user_id").references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({ byUserDue: index("personal_reminders_user_due_idx").on(t.organizationId, t.userId, t.dueAt) }));

export const mindMaps = pgTable("mind_maps", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  ownerUserId: uuid("owner_user_id").notNull().references(() => users.id),
  projectId: uuid("project_id").references(() => projects.id),
  name: text("name").notNull(),
  sourceType: text("source_type").default("free").notNull(),
  sourceId: uuid("source_id"),
  shared: boolean("shared").default(false).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({ byOwner: index("mind_maps_owner_idx").on(t.organizationId, t.ownerUserId) }));

export const mindMapNodes = pgTable("mind_map_nodes", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  mindMapId: uuid("mind_map_id").notNull().references(() => mindMaps.id),
  parentNodeId: uuid("parent_node_id"),
  workItemId: uuid("work_item_id").references(() => workItems.id),
  label: text("label").notNull(),
  x: doublePrecision("x").default(0).notNull(),
  y: doublePrecision("y").default(0).notNull(),
  style: jsonb("style").default({}).notNull(),
  rank: text("rank").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({ byMap: index("mind_map_nodes_map_idx").on(t.mindMapId) }));

export const locationProjections = pgTable("location_projections", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  workItemId: uuid("work_item_id").notNull().references(() => workItems.id),
  latitude: doublePrecision("latitude").notNull(),
  longitude: doublePrecision("longitude").notNull(),
  label: text("label"),
  precision: text("precision").default("exact").notNull(),
  sensitive: boolean("sensitive").default(false).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({ unique: uniqueIndex("location_projections_item_unique").on(t.workItemId), geo: index("location_projections_geo_idx").on(t.organizationId, t.latitude, t.longitude) }));

export const browserCaptures = pgTable("browser_captures", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  userId: uuid("user_id").notNull().references(() => users.id),
  targetType: text("target_type").notNull(),
  targetId: uuid("target_id"),
  url: text("url").notNull(),
  title: text("title"),
  selectedText: text("selected_text"),
  screenshotRef: text("screenshot_ref"),
  status: text("status").default("captured").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({ byUser: index("browser_captures_user_idx").on(t.organizationId, t.userId, t.createdAt) }));

export const deviceRegistrations = pgTable("device_registrations", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  userId: uuid("user_id").notNull().references(() => users.id),
  deviceId: text("device_id").notNull(),
  platform: text("platform").notNull(),
  pushTokenHash: text("push_token_hash"),
  clientVersion: text("client_version"),
  status: text("status").default("active").notNull(),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).defaultNow().notNull(),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
}, (t) => ({ unique: uniqueIndex("device_registrations_unique").on(t.organizationId, t.userId, t.deviceId) }));

export const offlineQueue = pgTable("offline_queue", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  userId: uuid("user_id").notNull().references(() => users.id),
  deviceId: text("device_id").notNull(),
  operationKey: text("operation_key").notNull(),
  action: text("action").notNull(),
  payload: jsonb("payload").default({}).notNull(),
  baseVersion: integer("base_version"),
  status: text("status").default("pending").notNull(),
  conflict: jsonb("conflict"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  processedAt: timestamp("processed_at", { withTimezone: true }),
}, (t) => ({ unique: uniqueIndex("offline_queue_operation_unique").on(t.organizationId, t.userId, t.deviceId, t.operationKey), byDevice: index("offline_queue_device_idx").on(t.deviceId, t.status) }));
