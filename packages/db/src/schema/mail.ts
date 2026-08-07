import { pgTable, uuid, text, integer, boolean, timestamp } from "drizzle-orm/pg-core";
import { users } from "./identity.js";

/* ============================================================
 * MAIL (SMTP) SETTINGS — instance-level, managed from the platform console.
 * The password is stored encrypted (AES-256-GCM) and never returned by the API.
 * ============================================================ */
export const mailSettings = pgTable("mail_settings", {
  id: uuid("id").primaryKey().defaultRandom(),
  host: text("host").notNull(),
  port: integer("port").default(587).notNull(),
  secure: boolean("secure").default(false).notNull(),      // true = implicit TLS (465)
  username: text("username"),
  passwordEncrypted: text("password_encrypted"),           // AES-256-GCM, never exposed
  fromName: text("from_name").default("PM Platform").notNull(),
  fromEmail: text("from_email").notNull(),
  replyTo: text("reply_to"),
  enabled: boolean("enabled").default(false).notNull(),    // off = log-only adapter
  lastTestAt: timestamp("last_test_at", { withTimezone: true }),
  lastTestOk: boolean("last_test_ok"),
  lastTestError: text("last_test_error"),
  updatedByUserId: uuid("updated_by_user_id").references(() => users.id),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});
