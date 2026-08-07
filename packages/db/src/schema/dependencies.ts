import { pgTable, uuid, text, timestamp, boolean, date, jsonb, uniqueIndex, index } from "drizzle-orm/pg-core";
import { auditColumns } from "./_common.js";
import { organizations } from "./identity.js";
import { workItems, projects } from "./work.js";

/* ============================================================
 * DEPENDENCIES  (V1: conflicts are DISPLAYED only — no cascade)
 * ============================================================ */
export const workItemDependencies = pgTable("work_item_dependencies", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  predecessorId: uuid("predecessor_id").notNull().references(() => workItems.id),
  successorId: uuid("successor_id").notNull().references(() => workItems.id),
  type: text("type").default("finish_to_start").notNull(), // finish_to_start|start_to_start|finish_to_finish
  ...auditColumns,
}, (t) => ({ pairUnique: uniqueIndex("work_item_dependency_unique").on(t.predecessorId, t.successorId), bySucc: index("dependency_successor_idx").on(t.successorId) }));

/* ============================================================
 * WORKING CALENDARS + HOLIDAYS
 * ============================================================ */
export const workingCalendars = pgTable("working_calendars", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  name: text("name").notNull(),
  workingDays: jsonb("working_days").notNull(),           // [1,2,3,4,5] (0=Sun..6=Sat)
  timezone: text("timezone").default("UTC").notNull(),
  isDefault: boolean("is_default").default(false).notNull(),
  ...auditColumns,
});

export const holidays = pgTable("holidays", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  calendarId: uuid("calendar_id").notNull().references(() => workingCalendars.id),
  date: date("date").notNull(),
  name: text("name").notNull(),
}, (t) => ({ calDateUnique: uniqueIndex("holiday_unique").on(t.calendarId, t.date) }));

/* Minimal baseline snapshot store (full baselines/critical path are Post-V1). */
export const scheduleBaselines = pgTable("schedule_baselines", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  projectId: uuid("project_id").notNull().references(() => projects.id),
  name: text("name").notNull(),
  snapshot: jsonb("snapshot").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

/* ============================================================
 * RESCHEDULE OPERATIONS (cascade undo journal) — Post-V1 6-remainder
 * ============================================================ */
export const rescheduleOperations = pgTable("reschedule_operations", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  projectId: uuid("project_id").notNull().references(() => projects.id),
  triggerItemId: uuid("trigger_item_id").notNull().references(() => workItems.id),
  actorUserId: uuid("actor_user_id").notNull(),
  before: jsonb("before").notNull(),   // [{ itemId, startDate, dueDate }]
  after: jsonb("after").notNull(),     // [{ itemId, startDate, dueDate }]
  undone: boolean("undone").default(false).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});
