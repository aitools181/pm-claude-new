import { pgTable, uuid, text, integer, timestamp, date, jsonb, uniqueIndex, index } from "drizzle-orm/pg-core";
import { organizations, users } from "./identity.js";
import { projects } from "./work.js";

/* ============================================================
 * RESOURCE MANAGEMENT — Phase 7 (capacity / leave / allocation)
 * ============================================================ */

/** Per-user working-hours profile. workingDays overrides the org calendar when set. */
export const capacityProfiles = pgTable("capacity_profiles", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  userId: uuid("user_id").notNull().references(() => users.id),
  hoursPerDay: integer("hours_per_day").default(8).notNull(),
  workingDays: jsonb("working_days"),   // number[] (1..7) or null = use calendar default
}, (t) => ({ perUser: uniqueIndex("capacity_profile_user_unique").on(t.organizationId, t.userId) }));

/** Leave / time off. Reduces capacity on overlapping working days. */
export const leaves = pgTable("leaves", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  userId: uuid("user_id").notNull().references(() => users.id),
  startDate: date("start_date").notNull(),
  endDate: date("end_date").notNull(),
  type: text("type").default("vacation").notNull(),        // vacation|sick|holiday|other
  status: text("status").default("approved").notNull(),    // pending|approved|cancelled
  note: text("note"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({ byUser: index("leaves_user_idx").on(t.organizationId, t.userId, t.startDate) }));

/** Allocation of a person to a project for a period at some percent of capacity. */
export const allocations = pgTable("allocations", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  userId: uuid("user_id").notNull().references(() => users.id),
  projectId: uuid("project_id").notNull().references(() => projects.id),
  startDate: date("start_date").notNull(),
  endDate: date("end_date").notNull(),
  percent: integer("percent").default(100).notNull(),      // 0..100 of daily capacity
  note: text("note"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({ byUser: index("allocations_user_idx").on(t.organizationId, t.userId, t.startDate), byProject: index("allocations_project_idx").on(t.projectId) }));
