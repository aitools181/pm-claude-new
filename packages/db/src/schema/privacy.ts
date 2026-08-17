import { pgTable, uuid, text, timestamp, date, jsonb, index } from "drizzle-orm/pg-core";
import { organizations, users } from "./identity.js";
import { projects } from "./work.js";

/* ============================================================
 * X03 — Privacy Operations: DSR, Legal Hold, Consent, Anonymisation
 * ============================================================ */

/** I.3.1 — Data Subject Requests: access/export, rectification, erasure,
 *  restriction, portability, objection. SLA-clocked intake. */
export const dataSubjectRequests = pgTable("data_subject_requests", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  subjectUserId: uuid("subject_user_id").notNull().references(() => users.id),
  requestedByUserId: uuid("requested_by_user_id").notNull().references(() => users.id),
  requestType: text("request_type").notNull(), // access|rectification|erasure|restriction|portability|objection
  status: text("status").default("intake").notNull(), // intake|verifying|in_progress|completed|rejected
  slaDeadline: timestamp("sla_deadline", { withTimezone: true }).notNull(),
  verifiedAt: timestamp("verified_at", { withTimezone: true }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  notes: text("notes"),
  exportManifest: jsonb("export_manifest"), // { counts, generatedAt } — the human index for an access/export/portability request
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  byOrg: index("dsr_org_idx").on(t.organizationId, t.status),
  bySubject: index("dsr_subject_idx").on(t.subjectUserId),
}));

/** I.3.3 — Legal hold: scope is user, project, date range, or a saved query;
 *  an active hold hard-blocks retention purge for matching items. */
export const legalHolds = pgTable("legal_holds", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  scope: text("scope").notNull(), // user|project|date_range|query
  scopeUserId: uuid("scope_user_id").references(() => users.id),
  scopeProjectId: uuid("scope_project_id").references(() => projects.id),
  dateFrom: date("date_from"),
  dateTo: date("date_to"),
  reason: text("reason").notNull(),
  createdByUserId: uuid("created_by_user_id").notNull().references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  releasedAt: timestamp("released_at", { withTimezone: true }),
  releasedByUserId: uuid("released_by_user_id").references(() => users.id),
  releaseApprovedByUserId: uuid("release_approved_by_user_id").references(() => users.id),
}, (t) => ({
  byOrg: index("legal_hold_org_idx").on(t.organizationId, t.releasedAt),
}));

/** I.3.4 — consent register: purpose, version, grant/withdrawal timestamps. */
export const consentRecords = pgTable("consent_records", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  userId: uuid("user_id").notNull().references(() => users.id),
  purpose: text("purpose").notNull(), // e.g. "telemetry", "marketing_email"
  version: text("version").notNull(),
  grantedAt: timestamp("granted_at", { withTimezone: true }).defaultNow().notNull(),
  withdrawnAt: timestamp("withdrawn_at", { withTimezone: true }),
}, (t) => ({
  byUser: index("consent_user_idx").on(t.organizationId, t.userId, t.purpose),
}));

/** I.3.2 — irreversible anonymisation audit: what was done, to whom, by whom. */
export const anonymisationRuns = pgTable("anonymisation_runs", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  targetUserId: uuid("target_user_id").notNull().references(() => users.id),
  performedByUserId: uuid("performed_by_user_id").notNull().references(() => users.id),
  fieldsAffected: jsonb("fields_affected").notNull(), // string[]
  dsrRequestId: uuid("dsr_request_id").references(() => dataSubjectRequests.id),
  performedAt: timestamp("performed_at", { withTimezone: true }).defaultNow().notNull(),
});
