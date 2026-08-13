import {
  pgTable, uuid, text, timestamp, integer, boolean, date, uniqueIndex, index, check,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { auditColumns } from "./_common.js";
import { organizations, users } from "./identity.js";
import { teams } from "./access.js";

/* ============================================================
 * WORKSPACES / DEPARTMENTS
 * ============================================================ */
export const workspaces = pgTable("workspaces", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  name: text("name").notNull(),
  ...auditColumns,
}, (t) => ({
  orgNameUnique: uniqueIndex("workspaces_org_name_unique").on(t.organizationId, t.name),
  byOrg: index("workspaces_org_idx").on(t.organizationId),
}));

export const workspaceMembers = pgTable("workspace_members", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id),
  userId: uuid("user_id").notNull().references(() => users.id),
  ...auditColumns,
}, (t) => ({ unique: uniqueIndex("workspace_members_unique").on(t.workspaceId, t.userId) }));

/* ============================================================
 * PROJECTS  (own a monotonic key sequence for work-item keys)
 * ============================================================ */
export const projects = pgTable("projects", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id),
  keyPrefix: text("key_prefix").notNull(),                 // e.g. "ENG"
  nextKeySeq: integer("next_key_seq").default(1).notNull(),
  agileEnabled: boolean("agile_enabled").default(false).notNull(),// atomic counter
  name: text("name").notNull(),
  description: text("description"),
  color: text("color").default("#5b5fc7").notNull(),
  icon: text("icon").default("project").notNull(),
  ownerUserId: uuid("owner_user_id").references(() => users.id),
  teamId: uuid("team_id").references(() => teams.id),
  status: text("status").default("active").notNull(),      // active|on_hold|completed|archived
  health: text("health").default("on_track").notNull(),    // on_track|at_risk|off_track
  privacy: text("privacy").default("workspace").notNull(), // workspace|private
  startDate: date("start_date"),
  dueDate: date("due_date"),
  ...auditColumns,
}, (t) => ({
  orgPrefixUnique: uniqueIndex("projects_org_prefix_unique").on(t.organizationId, t.keyPrefix),
  byWorkspace: index("projects_workspace_idx").on(t.workspaceId),
}));

export const projectMembers = pgTable("project_members", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  projectId: uuid("project_id").notNull().references(() => projects.id),
  userId: uuid("user_id").notNull().references(() => users.id),
  accessLevel: text("access_level").default("editor").notNull(),
  notifyTasks: boolean("notify_tasks").default(true).notNull(),
  ...auditColumns,
}, (t) => ({ unique: uniqueIndex("project_members_unique").on(t.projectId, t.userId) }));

export const sections = pgTable("sections", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  projectId: uuid("project_id").notNull().references(() => projects.id),
  name: text("name").notNull(),
  rank: text("rank").notNull(),                            // lexical rank for ordering
  ...auditColumns,
}, (t) => ({ byProject: index("sections_project_idx").on(t.projectId) }));

/* ============================================================
 * UNIFIED WORK ITEM ENGINE
 * ============================================================ */
export const workItemTypes = pgTable("work_item_types", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  key: text("key").notNull(),                              // task|subtask|...
  name: text("name").notNull(),
  icon: text("icon"),
  parentTypeId: uuid("parent_type_id"),
  isSystem: boolean("is_system").default(true).notNull(),
  ...auditColumns,
}, (t) => ({ orgKeyUnique: uniqueIndex("work_item_types_org_key_unique").on(t.organizationId, t.key) }));

export const workItems = pgTable("work_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id),
  owningProjectId: uuid("owning_project_id").notNull().references(() => projects.id), // IMMUTABLE
  typeId: uuid("type_id").notNull().references(() => workItemTypes.id),
  parentId: uuid("parent_id"),                            // subtask hierarchy (self-ref)
  key: text("key").notNull(),                             // e.g. "ENG-42"
  title: text("title").notNull(),
  description: text("description"),
  statusCategory: text("status_category").default("todo").notNull(), // todo|in_progress|done
  status: text("status").default("To Do").notNull(),
  priority: text("priority").default("normal").notNull(),// low|normal|high|urgent
  reporterUserId: uuid("reporter_user_id").references(() => users.id),
  primaryOwnerUserId: uuid("primary_owner_user_id").references(() => users.id),
  startDate: date("start_date"),
  dueDate: date("due_date"),
  durationDays: integer("duration_days"),
  scheduleMode: text("schedule_mode").default("manual").notNull(),
  estimateMinutes: integer("estimate_minutes"),
  storyPoints: integer("story_points"),
  sprintId: uuid("sprint_id"),
  backlogRank: text("backlog_rank"),
  progress: integer("progress").default(0).notNull(),
  publicToOrganization: boolean("public_to_organization").default(false).notNull(),
  ...auditColumns,
}, (t) => ({
  orgKeyUnique: uniqueIndex("work_items_org_key_unique").on(t.organizationId, t.key),
  byProject: index("work_items_project_idx").on(t.owningProjectId),
  byParent: index("work_items_parent_idx").on(t.parentId),
  // Phase 12 performance: hot query paths
  keyset: index("work_items_keyset_idx").on(t.organizationId, t.createdAt, t.id),
  boardFilter: index("work_items_board_idx").on(t.organizationId, t.owningProjectId, t.statusCategory),
  recycleBin: index("work_items_recycle_idx").on(t.organizationId, t.deletedAt),
  progressCheck: check("work_items_progress_check", sql`progress >= 0 AND progress <= 100`),
}));

// A Work Item has exactly ONE owning placement and zero+ linked placements.
export const workItemPlacements = pgTable("work_item_placements", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  workItemId: uuid("work_item_id").notNull().references(() => workItems.id),
  projectId: uuid("project_id").notNull().references(() => projects.id),
  sectionId: uuid("section_id").references(() => sections.id),
  rank: text("rank").notNull(),
  isOwning: boolean("is_owning").default(false).notNull(),
  ...auditColumns,
}, (t) => ({
  // exactly one owning placement per work item
  owningUnique: uniqueIndex("placement_owning_unique").on(t.workItemId).where(sql`is_owning = true`),
  // a work item appears at most once per project
  itemProjectUnique: uniqueIndex("placement_item_project_unique").on(t.workItemId, t.projectId),
  byProject: index("placement_project_idx").on(t.projectId),
}));

export const workItemAssignees = pgTable("work_item_assignees", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  workItemId: uuid("work_item_id").notNull().references(() => workItems.id),
  userId: uuid("user_id").notNull().references(() => users.id),
}, (t) => ({ unique: uniqueIndex("work_item_assignees_unique").on(t.workItemId, t.userId) }));

export const workItemWatchers = pgTable("work_item_watchers", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  workItemId: uuid("work_item_id").notNull().references(() => workItems.id),
  userId: uuid("user_id").notNull().references(() => users.id),
}, (t) => ({ unique: uniqueIndex("work_item_watchers_unique").on(t.workItemId, t.userId) }));

export const tags = pgTable("tags", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  name: text("name").notNull(),
}, (t) => ({ orgNameUnique: uniqueIndex("tags_org_name_unique").on(t.organizationId, t.name) }));

export const workItemTags = pgTable("work_item_tags", {
  id: uuid("id").primaryKey().defaultRandom(),
  workItemId: uuid("work_item_id").notNull().references(() => workItems.id),
  tagId: uuid("tag_id").notNull().references(() => tags.id),
}, (t) => ({ unique: uniqueIndex("work_item_tags_unique").on(t.workItemId, t.tagId) }));

export const checklists = pgTable("checklists", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  workItemId: uuid("work_item_id").notNull().references(() => workItems.id),
  title: text("title").notNull(),
  ...auditColumns,
});

export const checklistItems = pgTable("checklist_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  checklistId: uuid("checklist_id").notNull().references(() => checklists.id),
  text: text("text").notNull(),
  done: boolean("done").default(false).notNull(),
  rank: text("rank").notNull(),
});

// User-facing activity (distinct from security audit_events).
export const activityEvents = pgTable("activity_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  workItemId: uuid("work_item_id"),
  projectId: uuid("project_id"),
  actorUserId: uuid("actor_user_id").references(() => users.id),
  action: text("action").notNull(),
  data: text("data"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({ byItem: index("activity_events_item_idx").on(t.workItemId, t.createdAt) }));
