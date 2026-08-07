import { pgTable, uuid, text, integer, timestamp, jsonb, index } from "drizzle-orm/pg-core";
import { organizations, users } from "./identity.js";
import { projects, workItems } from "./work.js";

/* ============================================================
 * AGILE — Phase 8 (sprints, scope events, frozen reports, releases)
 * ============================================================ */

export const sprints = pgTable("sprints", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  projectId: uuid("project_id").notNull().references(() => projects.id),
  name: text("name").notNull(),
  goal: text("goal"),
  state: text("state").default("planned").notNull(),          // planned|active|closed
  startDate: text("start_date"),
  endDate: text("end_date"),
  committedPoints: integer("committed_points"),               // snapshot at start
  committedItemIds: jsonb("committed_item_ids"),              // uuid[] baseline snapshot at start
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  startedAt: timestamp("started_at", { withTimezone: true }),
  closedAt: timestamp("closed_at", { withTimezone: true }),
}, (t) => ({ byProject: index("sprints_project_idx").on(t.organizationId, t.projectId, t.state) }));

/** Scope changes tracked only AFTER a sprint starts (vs the committed baseline). */
export const sprintScopeEvents = pgTable("sprint_scope_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  sprintId: uuid("sprint_id").notNull().references(() => sprints.id),
  workItemId: uuid("work_item_id").notNull().references(() => workItems.id),
  type: text("type").notNull(),                               // added|removed
  points: integer("points"),
  actorUserId: uuid("actor_user_id").references(() => users.id),
  at: timestamp("at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({ bySprint: index("sprint_scope_events_sprint_idx").on(t.sprintId) }));

/** Frozen snapshot written at close — never changes with later item edits. */
export const sprintReports = pgTable("sprint_reports", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  sprintId: uuid("sprint_id").notNull().references(() => sprints.id).unique(),
  committedPoints: integer("committed_points").notNull(),
  completedPoints: integer("completed_points").notNull(),
  addedPoints: integer("added_points").notNull(),
  removedPoints: integer("removed_points").notNull(),
  carriedOverPoints: integer("carried_over_points").notNull(),
  completedItemCount: integer("completed_item_count").notNull(),
  totalItemCount: integer("total_item_count").notNull(),
  burndown: jsonb("burndown").notNull(),                      // [{date, remaining}]
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const releases = pgTable("releases", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  projectId: uuid("project_id").notNull().references(() => projects.id),
  name: text("name").notNull(),
  version: text("version"),
  status: text("status").default("planned").notNull(),       // planned|released
  releaseDate: text("release_date"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  releasedAt: timestamp("released_at", { withTimezone: true }),
}, (t) => ({ byProject: index("releases_project_idx").on(t.organizationId, t.projectId) }));

export const releaseItems = pgTable("release_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  releaseId: uuid("release_id").notNull().references(() => releases.id),
  workItemId: uuid("work_item_id").notNull().references(() => workItems.id),
}, (t) => ({ byRelease: index("release_items_release_idx").on(t.releaseId) }));

/** Status-category transition log — powers cycle/lead time, CFD and burnup. */
export const workItemStatusHistory = pgTable("work_item_status_history", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  workItemId: uuid("work_item_id").notNull().references(() => workItems.id),
  projectId: uuid("project_id").notNull().references(() => projects.id),
  fromCategory: text("from_category"),
  toCategory: text("to_category").notNull(),
  at: timestamp("at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({ byItem: index("wi_status_history_item_idx").on(t.workItemId), byProject: index("wi_status_history_project_idx").on(t.organizationId, t.projectId, t.at) }));
