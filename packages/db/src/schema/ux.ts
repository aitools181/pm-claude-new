import { pgTable, uuid, text, timestamp, integer, boolean, jsonb, uniqueIndex, index } from "drizzle-orm/pg-core";
import { organizations, users } from "./identity.js";
import { projects, workItems } from "./work.js";

/** User-facing UI preferences and saved presentation state. */
export const userUiPreferences = pgTable("user_ui_preferences", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  userId: uuid("user_id").notNull().references(() => users.id),
  themeMode: text("theme_mode").default("light").notNull(), // light|dark|system
  chromeTone: text("chrome_tone").default("black").notNull(), // black|gray|accent
  colorPreset: text("color_preset").default("asana").notNull(),
  customAccent: text("custom_accent"),
  homeBackground: text("home_background").default("sunset").notNull(),
  density: text("density").default("comfortable").notNull(), // comfortable|compact
  locale: text("locale").default("en").notNull(),
  personalWeekStart: integer("personal_week_start"),
  notificationPopupSeconds: integer("notification_popup_seconds").default(5).notNull(),
  defaultLanding: text("default_landing").default("/home").notNull(),
  showRowNumbers: boolean("show_row_numbers").default(false).notNull(),
  colorBlindMode: boolean("color_blind_mode").default(false).notNull(),
  celebrations: boolean("celebrations").default(true).notNull(),
  inboxSummaryEnabled: boolean("inbox_summary_enabled").default(true).notNull(),
  inboxSummaryTimeframe: text("inbox_summary_timeframe").default("week").notNull(),
  navigationPreferences: jsonb("navigation_preferences").default({}).notNull(),
  customTheme: jsonb("custom_theme").default({}).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({ unique: uniqueIndex("user_ui_preferences_unique").on(t.organizationId, t.userId) }));

export const userHomeWidgets = pgTable("user_home_widgets", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  userId: uuid("user_id").notNull().references(() => users.id),
  widgetKey: text("widget_key").notNull(),
  enabled: boolean("enabled").default(true).notNull(),
  sortOrder: integer("sort_order").default(0).notNull(),
  size: text("size").default("medium").notNull(),
  config: jsonb("config").default({}).notNull(),
}, (t) => ({ unique: uniqueIndex("user_home_widgets_unique").on(t.organizationId, t.userId, t.widgetKey), byUser: index("user_home_widgets_user_idx").on(t.organizationId, t.userId, t.sortOrder) }));

export const savedUiViews = pgTable("saved_ui_views", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  userId: uuid("user_id").notNull().references(() => users.id),
  scopeType: text("scope_type").notNull(), // inbox|my_tasks|project
  scopeId: uuid("scope_id"),
  name: text("name").notNull(),
  viewType: text("view_type").default("list").notNull(),
  filters: jsonb("filters").default({}).notNull(),
  columns: jsonb("columns").default([]).notNull(),
  sortSpec: jsonb("sort_spec").default({}).notNull(),
  groupBy: text("group_by"),
  isDefault: boolean("is_default").default(false).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({ byScope: index("saved_ui_views_scope_idx").on(t.organizationId, t.userId, t.scopeType, t.scopeId) }));


export const projectAiSummarySettings = pgTable("project_ai_summary_settings", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  projectId: uuid("project_id").notNull().references(() => projects.id),
  includeSources: boolean("include_sources").default(true).notNull(),
  includeRiskReport: boolean("include_risk_report").default(true).notNull(),
  regularUpdates: boolean("regular_updates").default(false).notNull(),
  timeframe: text("timeframe").default("30d").notNull(),
  summary: text("summary"),
  generatedAt: timestamp("generated_at", { withTimezone: true }),
  generatedBy: uuid("generated_by").references(() => users.id),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({ unique: uniqueIndex("project_ai_summary_settings_unique").on(t.organizationId, t.projectId) }));

export const projectFavorites = pgTable("project_favorites", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  userId: uuid("user_id").notNull().references(() => users.id),
  projectId: uuid("project_id").notNull().references(() => projects.id),
  rank: integer("rank").default(0).notNull(),
}, (t) => ({ unique: uniqueIndex("project_favorites_unique").on(t.organizationId, t.userId, t.projectId) }));

export const projectStatusUpdates = pgTable("project_status_updates", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  projectId: uuid("project_id").notNull().references(() => projects.id),
  authorUserId: uuid("author_user_id").notNull().references(() => users.id),
  health: text("health").notNull(),
  title: text("title").notNull(),
  body: text("body").default("").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({ byProject: index("project_status_updates_project_idx").on(t.projectId, t.createdAt) }));

export const projectResources = pgTable("project_resources", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  projectId: uuid("project_id").notNull().references(() => projects.id),
  kind: text("kind").default("link").notNull(), // link|brief|file
  name: text("name").notNull(),
  url: text("url"),
  body: text("body"),
  rank: integer("rank").default(0).notNull(),
  createdBy: uuid("created_by").references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({ byProject: index("project_resources_project_idx").on(t.projectId, t.rank) }));

export const workItemLikes = pgTable("work_item_likes", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  workItemId: uuid("work_item_id").notNull().references(() => workItems.id),
  userId: uuid("user_id").notNull().references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({ unique: uniqueIndex("work_item_likes_unique").on(t.organizationId, t.workItemId, t.userId), byItem: index("work_item_likes_item_idx").on(t.workItemId) }));

export const userEmailForwarding = pgTable("user_email_forwarding", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  userId: uuid("user_id").notNull().references(() => users.id),
  address: text("address").notNull(),
  enabled: boolean("enabled").default(true).notNull(),
  destinationProjectId: uuid("destination_project_id").references(() => projects.id),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({ unique: uniqueIndex("user_email_forwarding_unique").on(t.organizationId, t.userId), addressUnique: uniqueIndex("user_email_forwarding_address_unique").on(t.address) }));

export const projectMessages = pgTable("project_messages", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  projectId: uuid("project_id").notNull().references(() => projects.id),
  authorUserId: uuid("author_user_id").notNull().references(() => users.id),
  subject: text("subject").notNull(),
  body: text("body").default("").notNull(),
  pinned: boolean("pinned").default(false).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({ byProject: index("project_messages_project_idx").on(t.organizationId, t.projectId, t.createdAt) }));
