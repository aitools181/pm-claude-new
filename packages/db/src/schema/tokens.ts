import { pgTable, uuid, text, timestamp, uniqueIndex, index } from "drizzle-orm/pg-core";
import { users } from "./identity.js";

/** Single-use, expiring tokens for email verification and password reset. */
export const authTokens = pgTable("auth_tokens", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id),
  purpose: text("purpose").notNull(),           // "verify_email" | "reset_password"
  tokenHash: text("token_hash").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  usedAt: timestamp("used_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  tokenUnique: uniqueIndex("auth_tokens_hash_unique").on(t.tokenHash),
  byUserPurpose: index("auth_tokens_user_purpose_idx").on(t.userId, t.purpose, t.createdAt),
}));

/** Hashed, one-time 2FA recovery codes. Raw values are returned exactly once. */
export const twoFactorRecoveryCodes = pgTable("two_factor_recovery_codes", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id),
  codeHash: text("code_hash").notNull(),
  usedAt: timestamp("used_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  codeUnique: uniqueIndex("two_factor_recovery_codes_hash_unique").on(t.codeHash),
  byUser: index("two_factor_recovery_codes_user_idx").on(t.userId, t.usedAt),
}));
