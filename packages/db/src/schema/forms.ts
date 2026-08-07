import { pgTable, uuid, text, integer, timestamp, boolean, jsonb, uniqueIndex, index } from "drizzle-orm/pg-core";
import { organizations, users } from "./identity.js";
import { projects, workItems, workItemTypes } from "./work.js";

/* ============================================================
 * FORMS — Phase 7 (builder / versioning / routing / submissions)
 * ============================================================ */

export const forms = pgTable("forms", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  key: text("key").notNull(),
  name: text("name").notNull(),
  description: text("description"),
  status: text("status").default("draft").notNull(),        // draft|published|archived
  // draft working copy (published into an immutable form_version)
  draftFields: jsonb("draft_fields").default([]).notNull(),         // FormField[]
  draftRouting: jsonb("draft_routing").default([]).notNull(),       // RoutingRule[]
  defaultProjectId: uuid("default_project_id").references(() => projects.id),
  defaultTypeId: uuid("default_type_id").references(() => workItemTypes.id),
  currentVersionId: uuid("current_version_id"),
  publicEnabled: boolean("public_enabled").default(false).notNull(),
  publicToken: text("public_token"),
  createdByUserId: uuid("created_by_user_id").notNull().references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({ keyUnique: uniqueIndex("forms_key_unique").on(t.organizationId, t.key), tokenUnique: uniqueIndex("forms_public_token_unique").on(t.publicToken) }));

export const formVersions = pgTable("form_versions", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  formId: uuid("form_id").notNull().references(() => forms.id),
  version: integer("version").notNull(),
  fields: jsonb("fields").notNull(),          // immutable snapshot
  routing: jsonb("routing").notNull(),
  defaultProjectId: uuid("default_project_id").references(() => projects.id),
  defaultTypeId: uuid("default_type_id").references(() => workItemTypes.id),
  publishedByUserId: uuid("published_by_user_id").notNull().references(() => users.id),
  publishedAt: timestamp("published_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({ perForm: uniqueIndex("form_version_unique").on(t.formId, t.version) }));

export const formSubmissions = pgTable("form_submissions", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  formId: uuid("form_id").notNull().references(() => forms.id),
  versionId: uuid("version_id").notNull().references(() => formVersions.id),
  source: text("source").default("internal").notNull(),   // internal|public
  submittedByUserId: uuid("submitted_by_user_id").references(() => users.id),
  answers: jsonb("answers").notNull(),
  createdWorkItemId: uuid("created_work_item_id").references(() => workItems.id),
  status: text("status").default("received").notNull(),   // received|routed|failed
  requesterRef: text("requester_ref"),                    // opaque ref for public requester access
  ip: text("ip"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({ byForm: index("form_submissions_form_idx").on(t.organizationId, t.formId), byRequester: index("form_submissions_requester_idx").on(t.requesterRef) }));
