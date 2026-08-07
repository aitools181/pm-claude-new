import { pgTable, uuid, text, integer, doublePrecision, timestamp, index } from "drizzle-orm/pg-core";
import { organizations, users } from "./identity.js";

/* ============================================================
 * GOALS / OKRs — Phase 9 (hierarchy, targets, links, rollups, history)
 * ============================================================ */

export const goals = pgTable("goals", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  parentId: uuid("parent_id"),                               // goal hierarchy (OKR = objective + child KRs)
  name: text("name").notNull(),
  description: text("description"),
  ownerUserId: uuid("owner_user_id").references(() => users.id),
  targetType: text("target_type").default("percent").notNull(), // percent|numeric|binary|rollup
  startValue: doublePrecision("start_value"),
  targetValue: doublePrecision("target_value"),
  currentValue: doublePrecision("current_value"),
  unit: text("unit"),
  confidence: text("confidence").default("on_track").notNull(),  // on_track|at_risk|off_track
  status: text("status").default("active").notNull(),           // active|closed
  dueDate: text("due_date"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({ byParent: index("goals_parent_idx").on(t.organizationId, t.parentId) }));

/** Links from a goal to projects / work items / metrics (drive auto rollups). */
export const goalLinks = pgTable("goal_links", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  goalId: uuid("goal_id").notNull().references(() => goals.id),
  kind: text("kind").notNull(),                              // project|work_item|metric
  refId: uuid("ref_id").notNull(),
  weight: integer("weight").default(1).notNull(),
}, (t) => ({ byGoal: index("goal_links_goal_idx").on(t.goalId) }));

/** Immutable check-in history. */
export const goalUpdates = pgTable("goal_updates", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  goalId: uuid("goal_id").notNull().references(() => goals.id),
  currentValue: doublePrecision("current_value"),
  progress: integer("progress"),
  confidence: text("confidence"),
  note: text("note"),
  actorUserId: uuid("actor_user_id").references(() => users.id),
  at: timestamp("at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({ byGoal: index("goal_updates_goal_idx").on(t.goalId, t.at) }));
