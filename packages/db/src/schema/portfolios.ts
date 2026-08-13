import { pgTable, uuid, text, timestamp, integer, jsonb, index, uniqueIndex } from "drizzle-orm/pg-core";
import { organizations, users } from "./identity.js";
import { projects } from "./work.js";

/* ============================================================
 * PORTFOLIOS — Phase 9 (portfolios, initiatives, milestones, rollups)
 * ============================================================ */

export const portfolios = pgTable("portfolios", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  name: text("name").notNull(),
  description: text("description"),
  ownerUserId: uuid("owner_user_id").references(() => users.id),
  status: text("status").default("active").notNull(),       // active|archived
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const portfolioProjects = pgTable("portfolio_projects", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  portfolioId: uuid("portfolio_id").notNull().references(() => portfolios.id),
  projectId: uuid("project_id").notNull().references(() => projects.id),
  budgetCents: integer("budget_cents"),
  serviceLine: text("service_line"),
  customFields: jsonb("custom_fields").default({}).notNull(),
}, (t) => ({ uniq: uniqueIndex("portfolio_projects_unique").on(t.portfolioId, t.projectId) }));


export const portfolioColumns = pgTable("portfolio_columns", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  portfolioId: uuid("portfolio_id").notNull().references(() => portfolios.id),
  key: text("key").notNull(),
  name: text("name").notNull(),
  type: text("type").default("text").notNull(),
  rank: integer("rank").default(0).notNull(),
  config: jsonb("config").default({}).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({ unique: uniqueIndex("portfolio_columns_unique").on(t.portfolioId, t.key), byPortfolio: index("portfolio_columns_portfolio_idx").on(t.organizationId, t.portfolioId, t.rank) }));

export const initiatives = pgTable("initiatives", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  portfolioId: uuid("portfolio_id").notNull().references(() => portfolios.id),
  name: text("name").notNull(),
  description: text("description"),
  leadUserId: uuid("lead_user_id").references(() => users.id),
  status: text("status").default("planned").notNull(),      // planned|in_progress|done|cancelled
  targetDate: text("target_date"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({ byPortfolio: index("initiatives_portfolio_idx").on(t.portfolioId) }));

export const initiativeProjects = pgTable("initiative_projects", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  initiativeId: uuid("initiative_id").notNull().references(() => initiatives.id),
  projectId: uuid("project_id").notNull().references(() => projects.id),
}, (t) => ({ uniq: uniqueIndex("initiative_projects_unique").on(t.initiativeId, t.projectId) }));

export const milestones = pgTable("milestones", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  portfolioId: uuid("portfolio_id").notNull().references(() => portfolios.id),
  initiativeId: uuid("initiative_id").references(() => initiatives.id),
  name: text("name").notNull(),
  dueDate: text("due_date"),
  status: text("status").default("planned").notNull(),      // planned|hit|missed
  completedAt: timestamp("completed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({ byPortfolio: index("milestones_portfolio_idx").on(t.portfolioId) }));
