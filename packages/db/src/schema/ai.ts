import { pgTable, uuid, text, integer, boolean, timestamp, jsonb, index, uniqueIndex } from "drizzle-orm/pg-core";
import { organizations, users } from "./identity.js";
import { workItems } from "./work.js";

/* ============================================================
 * AI ASSISTANT — Phase 13 (optional: proposals, citations, audit, budget)
 * ============================================================ */
export const aiSettings = pgTable("ai_settings", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  providerKind: text("provider_kind").default("mock").notNull(),  // mock|byok|local
  model: text("model"),
  budgetTokens: integer("budget_tokens").default(100000).notNull(),
  usedTokens: integer("used_tokens").default(0).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({ uniq: uniqueIndex("ai_settings_org_unique").on(t.organizationId) }));

/** AI never mutates directly — it proposes; a human confirms; then it applies + audits. */
export const aiActionProposals = pgTable("ai_action_proposals", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  userId: uuid("user_id").notNull().references(() => users.id),
  kind: text("kind").notNull(),                          // create_task|update_status|draft_meeting
  title: text("title").notNull(),
  payload: jsonb("payload").default({}).notNull(),
  citations: jsonb("citations").default([]).notNull(),   // [{kind,id,key}] source objects
  degraded: boolean("degraded").default(false).notNull(),// true if produced without the provider
  status: text("status").default("proposed").notNull(),  // proposed|applied|rejected
  createdWorkItemId: uuid("created_work_item_id").references(() => workItems.id),
  decidedAt: timestamp("decided_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({ byOrg: index("ai_proposals_org_idx").on(t.organizationId, t.status) }));

export const aiAuditLog = pgTable("ai_audit_log", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  userId: uuid("user_id").references(() => users.id),
  event: text("event").notNull(),                        // retrieval|propose|confirm|reject|apply
  detail: jsonb("detail").default({}).notNull(),
  at: timestamp("at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({ byOrg: index("ai_audit_org_idx").on(t.organizationId, t.at) }));
