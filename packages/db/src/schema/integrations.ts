import { pgTable, uuid, text, timestamp, jsonb, index, uniqueIndex } from "drizzle-orm/pg-core";
import { organizations, users } from "./identity.js";

/* ============================================================
 * INTEGRATIONS — Phase 11 (adapters + encrypted credential vault)
 * ============================================================ */

export const integrations = pgTable("integrations", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  kind: text("kind").notNull(),                      // email|calendar|github|gitlab|generic
  name: text("name").notNull(),
  status: text("status").default("connected").notNull(),  // connected|disconnected|error
  config: jsonb("config").default({}).notNull(),     // NON-secret config only
  healthStatus: text("health_status"),               // ok|failing|unknown
  healthDetail: text("health_detail"),
  lastHealthCheckAt: timestamp("last_health_check_at", { withTimezone: true }),
  createdByUserId: uuid("created_by_user_id").notNull().references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({ byOrg: index("integrations_org_idx").on(t.organizationId) }));

/** Encrypted credential vault — AES-256-GCM ciphertext only, plus a masked hint. */
export const integrationCredentials = pgTable("integration_credentials", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  integrationId: uuid("integration_id").notNull().references(() => integrations.id),
  ciphertext: text("ciphertext").notNull(),          // base64(iv|authTag|cipher)
  hint: text("hint").notNull(),                      // e.g. ••••ab12 (never the secret)
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({ uniq: uniqueIndex("integration_credentials_unique").on(t.integrationId) }));
