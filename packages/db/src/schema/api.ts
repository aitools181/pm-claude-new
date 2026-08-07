import { pgTable, uuid, text, timestamp, jsonb, integer, index, uniqueIndex } from "drizzle-orm/pg-core";
import { organizations, users } from "./identity.js";

/* ============================================================
 * PUBLIC API — Phase 11 (scoped tokens, idempotency)
 * ============================================================ */

/** Scoped API tokens. Only a SHA-256 hash is stored; the raw token is shown once. */
export const apiTokens = pgTable("api_tokens", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  name: text("name").notNull(),
  prefix: text("prefix").notNull(),                 // display only, e.g. pmk_ab12cd
  tokenHash: text("token_hash").notNull(),          // sha256(raw)
  scopes: jsonb("scopes").default([]).notNull(),    // string[] e.g. ["work:read","work:write"]
  createdByUserId: uuid("created_by_user_id").notNull().references(() => users.id),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({ byHash: uniqueIndex("api_tokens_hash_unique").on(t.tokenHash), byOrg: index("api_tokens_org_idx").on(t.organizationId) }));

/** Idempotency keys make POSTs safe to retry — a repeat returns the stored response. */
export const idempotencyKeys = pgTable("idempotency_keys", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  key: text("key").notNull(),
  method: text("method").notNull(),
  path: text("path").notNull(),
  requestHash: text("request_hash"),
  statusCode: integer("status_code").notNull(),
  responseBody: jsonb("response_body"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({ uniq: uniqueIndex("idempotency_keys_unique").on(t.organizationId, t.key) }));
