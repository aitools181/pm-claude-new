import {
  pgTable, uuid, text, timestamp, boolean, integer,
  uniqueIndex, index, jsonb,
} from "drizzle-orm/pg-core";
import { auditColumns } from "./_common.js";

/* ============================================================
 * GLOBAL IDENTITY (instance-level; scoped to orgs via membership)
 * ============================================================ */

// Users are GLOBAL. Their access to an org is granted via memberships.
export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull(),
  username: text("username"), // F02: optional unique handle, login alternative to email
  displayName: text("display_name").notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  emailVerifiedAt: timestamp("email_verified_at", { withTimezone: true }),
  // F03 extended profile
  avatarUrl: text("avatar_url"),
  designation: text("designation"),
  department: text("department"),
  managerUserId: uuid("manager_user_id"),
  workingHours: jsonb("working_hours"),   // { mon:{from,to}, ... } or null = org default
  contactFields: jsonb("contact_fields"), // { phone, mobile, location, ... }
  ...auditColumns,
}, (t) => ({
  // Global uniqueness of email (case-insensitive handled in app/citext later).
  emailUnique: uniqueIndex("users_email_unique").on(t.email),
  usernameUnique: uniqueIndex("users_username_unique").on(t.username),
}));


export const userEmailAddresses = pgTable("user_email_addresses", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id),
  email: text("email").notNull(),
  label: text("label"),
  verifiedAt: timestamp("verified_at", { withTimezone: true }),
  verificationTokenHash: text("verification_token_hash"),
  verificationExpiresAt: timestamp("verification_expires_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({ emailUnique: uniqueIndex("user_email_addresses_email_unique").on(t.email), byUser: index("user_email_addresses_user_idx").on(t.userId) }));

export const userCredentials = pgTable("user_credentials", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id),
  passwordHash: text("password_hash").notNull(),      // argon2id
  totpSecretEnc: text("totp_secret_enc"),             // encrypted; null = 2FA off
  totpEnabled: boolean("totp_enabled").default(false).notNull(),
  failedLoginCount: integer("failed_login_count").default(0).notNull(),
  lastFailedAt: timestamp("last_failed_at", { withTimezone: true }),
  lockedUntil: timestamp("locked_until", { withTimezone: true }),
  ...auditColumns,
}, (t) => ({
  userUnique: uniqueIndex("user_credentials_user_unique").on(t.userId),
}));

export const userSessions = pgTable("user_sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id),
  tokenHash: text("token_hash").notNull(),            // store hash, never raw token
  userAgent: text("user_agent"),
  ip: text("ip"),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  tokenUnique: uniqueIndex("user_sessions_token_unique").on(t.tokenHash),
  byUser: index("user_sessions_user_idx").on(t.userId),
}));

/* ============================================================
 * ORGANIZATIONS (tenancy root)
 * ============================================================ */

export const organizations = pgTable("organizations", {
  id: uuid("id").primaryKey().defaultRandom(),
  slug: text("slug").notNull(),
  name: text("name").notNull(),
  status: text("status").default("active").notNull(), // active|suspended|archived
  ...auditColumns,
}, (t) => ({
  slugUnique: uniqueIndex("organizations_slug_unique").on(t.slug),
}));

export const organizationSettings = pgTable("organization_settings", {
  organizationId: uuid("organization_id").primaryKey().references(() => organizations.id),
  timezone: text("timezone").default("UTC").notNull(),
  weekStart: integer("week_start").default(1).notNull(),
  dateFormat: text("date_format").default("YYYY-MM-DD").notNull(),
  // F01 depth
  timeFormat: text("time_format").default("24h").notNull(),          // 24h | 12h
  numberFormat: text("number_format").default("1,234.56").notNull(), // display convention key
  workingDays: jsonb("working_days"),                                 // [1,2,3,4,5] ISO weekday numbers
  fiscalYearStartMonth: integer("fiscal_year_start_month").default(4).notNull(), // 1-12
  retentionDays: integer("retention_days"),                           // null = keep forever
  passwordPolicy: jsonb("password_policy"),                           // { minLength, requireUppercase, requireDigit, requireSymbol }
  branding: jsonb("branding"),
  ...auditColumns,
});

// The join that scopes a global user INTO an organization.
export const organizationMemberships = pgTable("organization_memberships", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  userId: uuid("user_id").notNull().references(() => users.id),
  status: text("status").default("active").notNull(),
  // F03: member = full account; guest = external collaborator with reduced surface.
  accountType: text("account_type").default("member").notNull(),
  ...auditColumns,
}, (t) => ({
  // A user appears at most once per organization.
  orgUserUnique: uniqueIndex("org_membership_org_user_unique").on(t.organizationId, t.userId),
  byOrg: index("org_membership_org_idx").on(t.organizationId),
}));
