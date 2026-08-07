import {
  pgTable, uuid, text, timestamp, boolean, jsonb, uniqueIndex, index, check,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { auditColumns } from "./_common.js";
import { organizations, users } from "./identity.js";

/* ============================================================
 * INVITATIONS  (single-use, hashed, expiring)
 * ============================================================ */
export const invitations = pgTable("invitations", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  email: text("email").notNull(),
  roleKey: text("role_key").notNull(),
  tokenHash: text("token_hash").notNull(),
  status: text("status").default("pending").notNull(), // pending|accepted|revoked|expired
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  invitedBy: uuid("invited_by").references(() => users.id),
  acceptedUserId: uuid("accepted_user_id").references(() => users.id),
  ...auditColumns,
}, (t) => ({
  tokenUnique: uniqueIndex("invitations_token_unique").on(t.tokenHash),
  byOrg: index("invitations_org_idx").on(t.organizationId),
  // at most one pending invite per email per org
  pendingUnique: uniqueIndex("invitations_pending_unique")
    .on(t.organizationId, t.email).where(sql`status = 'pending'`),
}));

/* ============================================================
 * SECURITY AUDIT EVENTS  (append-only; instance OR organization scope)
 * organization_id is NULL iff scope_type = 'instance'.
 * ============================================================ */
export const auditEvents = pgTable("audit_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  scopeType: text("scope_type").notNull(),              // 'instance' | 'organization'
  organizationId: uuid("organization_id").references(() => organizations.id),
  actorUserId: uuid("actor_user_id").references(() => users.id), // null = system
  action: text("action").notNull(),                     // e.g. "invitation.revoked"
  targetType: text("target_type"),
  targetId: text("target_id"),
  correlationId: text("correlation_id"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  scopeCheck: check("audit_scope_check", sql`
    (scope_type = 'instance' AND organization_id IS NULL) OR
    (scope_type = 'organization' AND organization_id IS NOT NULL)`),
  byOrg: index("audit_events_org_idx").on(t.organizationId, t.createdAt),
  byActor: index("audit_events_actor_idx").on(t.actorUserId),
}));

/* ============================================================
 * FEATURE FLAGS  (null organization_id = instance/global default)
 * ============================================================ */
export const featureFlags = pgTable("feature_flags", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").references(() => organizations.id),
  key: text("key").notNull(),
  enabled: boolean("enabled").default(false).notNull(),
  ...auditColumns,
}, (t) => ({
  scopeKeyUnique: uniqueIndex("feature_flags_scope_key_unique")
    .on(sql`coalesce(organization_id, '00000000-0000-0000-0000-000000000000')`, t.key),
}));

/* ============================================================
 * JOB IDEMPOTENCY  (worker de-duplication)
 * ============================================================ */
export const jobIdempotency = pgTable("job_idempotency", {
  key: text("key").primaryKey(),
  organizationId: uuid("organization_id"),
  result: jsonb("result"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});
