import { pgTable, uuid, text, timestamp } from "drizzle-orm/pg-core";
/** Single-use, expiring tokens for email verification and password reset. */
export const authTokens = pgTable("auth_tokens", {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull(),
    purpose: text("purpose").notNull(), // "verify_email" | "reset_password"
    tokenHash: text("token_hash").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});
//# sourceMappingURL=tokens.js.map