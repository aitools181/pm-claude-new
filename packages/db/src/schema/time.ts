import { pgTable, uuid, text, integer, timestamp, date, boolean, uniqueIndex, index } from "drizzle-orm/pg-core";
import { organizations, users } from "./identity.js";
import { workItems, projects } from "./work.js";

/* ============================================================
 * TIME TRACKING — Phase 7 (Time & Timesheets)
 * ============================================================ */

/** One running timer per user (enforced by unique userId). Stopping logs a time_entry. */
export const activeTimers = pgTable("active_timers", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  userId: uuid("user_id").notNull().references(() => users.id),
  workItemId: uuid("work_item_id").references(() => workItems.id),
  projectId: uuid("project_id").references(() => projects.id),
  description: text("description"),
  startedAt: timestamp("started_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({ onemPerUser: uniqueIndex("active_timer_user_unique").on(t.organizationId, t.userId) }));

/** Committed time entries (from a stopped timer or entered manually). */
export const timeEntries = pgTable("time_entries", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  userId: uuid("user_id").notNull().references(() => users.id),
  workItemId: uuid("work_item_id").references(() => workItems.id),
  projectId: uuid("project_id").references(() => projects.id),
  date: date("date").notNull(),                 // the working day the time is attributed to
  minutes: integer("minutes").notNull(),
  description: text("description"),
  source: text("source").default("manual").notNull(),   // manual | timer
  billable: boolean("billable").default(true).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  byUserDate: index("time_entries_user_date_idx").on(t.organizationId, t.userId, t.date),
  byItem: index("time_entries_item_idx").on(t.workItemId),
}));

/** Weekly timesheet state machine: open -> submitted -> approved -> locked; reject -> open; reopen -> open. */
export const timesheets = pgTable("timesheets", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  userId: uuid("user_id").notNull().references(() => users.id),
  weekStart: date("week_start").notNull(),      // Monday (ISO week)
  status: text("status").default("open").notNull(), // open|submitted|approved|rejected|locked
  submittedAt: timestamp("submitted_at", { withTimezone: true }),
  decidedByUserId: uuid("decided_by_user_id").references(() => users.id),
  decidedAt: timestamp("decided_at", { withTimezone: true }),
  note: text("note"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({ perUserWeek: uniqueIndex("timesheet_user_week_unique").on(t.organizationId, t.userId, t.weekStart) }));
