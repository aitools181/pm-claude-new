import { Optional, Injectable, Inject } from "@nestjs/common";
import { count, isNull, inArray, and, eq, sql } from "drizzle-orm";
import { schema, type Database } from "@pm/db";
import { AppError } from "@pm/shared";
import { DB } from "../db/db.module.js";
import { hashPassword, sha256, verifyPassword } from "../common/crypto.js";
import { TokenService } from "./token.service.js";
import { SessionService } from "./session.service.js";
import { MailService } from "../mail/mail.service.js";
import { AuditService } from "../audit/audit.service.js";

const MAX_DB_FAILURES = 5;
const LOCKOUT_MS = 15 * 60 * 1000;
const WINDOW_MS = 10 * 60 * 1000;
const MAX_WINDOW_ATTEMPTS = 12;

type AttemptWindow = { startedAt: number; count: number };

@Injectable()
export class AuthService {
  private readonly attempts = new Map<string, AttemptWindow>();

  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly tokens: TokenService,
    private readonly sessions: SessionService,
    private readonly mail: MailService,
    @Optional() private readonly audit?: AuditService,
  ) {}

  private rateKey(email: string, ip?: string) { return `${email.toLowerCase()}|${ip ?? "unknown"}`; }

  private checkRate(email: string, ip?: string) {
    const key = this.rateKey(email, ip);
    const now = Date.now();
    const current = this.attempts.get(key);
    if (!current || now - current.startedAt >= WINDOW_MS) {
      this.attempts.set(key, { startedAt: now, count: 1 });
      return;
    }
    current.count += 1;
    if (current.count > MAX_WINDOW_ATTEMPTS) throw new AppError("RATE_LIMITED", "Too many login attempts. Try again later.");
  }

  private clearRate(email: string, ip?: string) { this.attempts.delete(this.rateKey(email, ip)); }

  /** Verifies credentials and enforces database-backed lockout.
   *  F02: `email` may also be a username (no @). */
  async verifyCredentials(email: string, password: string, ip?: string) {
    const normalizedEmail = email.trim().toLowerCase();
    this.checkRate(normalizedEmail, ip);

    let [user] = normalizedEmail.includes("@")
      ? await this.db.select().from(schema.users).where(eq(schema.users.email, normalizedEmail)).limit(1)
      : await this.db.select().from(schema.users).where(eq(schema.users.username, normalizedEmail)).limit(1);
    if (!user && normalizedEmail.includes("@")) {
      const [alias] = await this.db.select({ userId: schema.userEmailAddresses.userId }).from(schema.userEmailAddresses)
        .where(and(eq(schema.userEmailAddresses.email, normalizedEmail), sql`${schema.userEmailAddresses.verifiedAt} is not null`)).limit(1);
      if (alias) [user] = await this.db.select().from(schema.users).where(eq(schema.users.id, alias.userId)).limit(1);
    }
    if (!user || !user.isActive) throw new AppError("UNAUTHENTICATED", "Invalid credentials");

    const [cred] = await this.db.select().from(schema.userCredentials)
      .where(eq(schema.userCredentials.userId, user.id)).limit(1);
    if (!cred) throw new AppError("UNAUTHENTICATED", "Invalid credentials");
    if (cred.lockedUntil && cred.lockedUntil > new Date()) {
      throw new AppError("RATE_LIMITED", "Account temporarily locked. Try again later.");
    }

    const valid = await verifyPassword(cred.passwordHash, password);
    if (!valid) {
      const nextCount = cred.failedLoginCount + 1;
      await this.db.update(schema.userCredentials).set({
        failedLoginCount: sql`${schema.userCredentials.failedLoginCount} + 1`,
        lastFailedAt: new Date(),
        lockedUntil: nextCount >= MAX_DB_FAILURES ? new Date(Date.now() + LOCKOUT_MS) : null,
        updatedAt: new Date(),
      }).where(eq(schema.userCredentials.userId, user.id));
      throw new AppError("UNAUTHENTICATED", "Invalid credentials");
    }

    await this.db.update(schema.userCredentials).set({
      failedLoginCount: 0,
      lastFailedAt: null,
      lockedUntil: null,
      updatedAt: new Date(),
    }).where(eq(schema.userCredentials.userId, user.id));
    this.clearRate(normalizedEmail, ip);
    return { user, twoFactorRequired: cred.totpEnabled };
  }

  /** Always returns the same response to prevent account enumeration. */
  async requestPasswordReset(email: string) {
    const [user] = await this.db.select().from(schema.users).where(eq(schema.users.email, email.trim().toLowerCase())).limit(1);
    if (user?.isActive) {
      const raw = await this.tokens.mint(user.id, "reset_password");
      await this.mail.send(user.email, "Reset your PM Platform password", `Open /reset-password?token=${encodeURIComponent(raw)} to set a new password. This link expires in 30 minutes.`);
    }
    return { accepted: true };
  }

  async resetPassword(rawToken: string, newPassword: string) {
    const userId = await this.db.transaction(async (tx) => {
      const scopedDb = tx as unknown as Database;
      const consumedUserId = await this.tokens.consume(rawToken, "reset_password", scopedDb);
      await this.assertPasswordPolicy(newPassword, await this.userOrgIds(consumedUserId));
      await scopedDb.update(schema.userCredentials).set({
        passwordHash: await hashPassword(newPassword),
        failedLoginCount: 0,
        lastFailedAt: null,
        lockedUntil: null,
        updatedAt: new Date(),
      }).where(eq(schema.userCredentials.userId, consumedUserId));
      await this.sessions.revokeAll(consumedUserId, undefined, scopedDb);
      await scopedDb.insert(schema.auditEvents).values({
        scopeType: "instance",
        actorUserId: consumedUserId,
        action: "identity.password_reset",
        targetType: "user",
        targetId: consumedUserId,
        metadata: { tokenFingerprint: sha256(rawToken).slice(0, 12) },
      });
      return consumedUserId;
    });
    return { reset: true, userId };
  }

  async changePassword(userId: string, currentPassword: string, newPassword: string) {
    const [cred] = await this.db.select().from(schema.userCredentials).where(eq(schema.userCredentials.userId, userId)).limit(1);
    if (!cred || !(await verifyPassword(cred.passwordHash, currentPassword))) throw new AppError("UNAUTHENTICATED", "Current password is incorrect");
    await this.db.transaction(async (tx) => {
      const scopedDb = tx as unknown as Database;
      await scopedDb.update(schema.userCredentials).set({ passwordHash: await hashPassword(newPassword), failedLoginCount: 0, lastFailedAt: null, lockedUntil: null, updatedAt: new Date() }).where(eq(schema.userCredentials.userId, userId));
      await this.sessions.revokeAll(userId, undefined, scopedDb);
      await scopedDb.insert(schema.auditEvents).values({ scopeType: "instance", actorUserId: userId, action: "identity.password_changed", targetType: "user", targetId: userId });
    });
    return { changed: true };
  }

  async requestEmailVerification(userId: string) {
    const [user] = await this.db.select().from(schema.users).where(and(eq(schema.users.id, userId), eq(schema.users.isActive, true))).limit(1);
    if (!user) throw new AppError("NOT_FOUND", "User not found");
    if (!user.emailVerifiedAt) {
      const raw = await this.tokens.mint(userId, "verify_email");
      await this.mail.send(user.email, "Verify your PM Platform email", `Open /verify-email?token=${encodeURIComponent(raw)} to verify your email. This link expires in 30 minutes.`);
    }
    return { accepted: true, alreadyVerified: Boolean(user.emailVerifiedAt) };
  }

  async verifyEmail(rawToken: string) {
    const userId = await this.db.transaction(async (tx) => {
      const scopedDb = tx as unknown as Database;
      const consumedUserId = await this.tokens.consume(rawToken, "verify_email", scopedDb);
      await scopedDb.update(schema.users).set({ emailVerifiedAt: new Date(), updatedAt: new Date() })
        .where(eq(schema.users.id, consumedUserId));
      await scopedDb.insert(schema.auditEvents).values({
        scopeType: "instance",
        actorUserId: consumedUserId,
        action: "identity.email_verified",
        targetType: "user",
        targetId: consumedUserId,
      });
      return consumedUserId;
    });
    return { verified: true, userId };
  }

  /** F02: strictest password policy across the user's organizations (or the one org given). */
  async assertPasswordPolicy(password: string, orgIds: string[]) {
    if (!orgIds.length) { if (password.length < 10) throw new AppError("VALIDATION", "Password must be at least 10 characters"); return; }
    const rows = await this.db.select({ policy: schema.organizationSettings.passwordPolicy }).from(schema.organizationSettings)
      .where(inArray(schema.organizationSettings.organizationId, orgIds));
    let minLength = 10, upper = false, digit = false, symbol = false;
    for (const r of rows) {
      const pol = (r.policy ?? {}) as { minLength?: number; requireUppercase?: boolean; requireDigit?: boolean; requireSymbol?: boolean };
      minLength = Math.max(minLength, Number(pol.minLength) || 10);
      upper ||= Boolean(pol.requireUppercase); digit ||= Boolean(pol.requireDigit); symbol ||= Boolean(pol.requireSymbol);
    }
    if (password.length < minLength) throw new AppError("VALIDATION", `Password must be at least ${minLength} characters (organization policy)`);
    if (upper && !/[A-Z]/.test(password)) throw new AppError("VALIDATION", "Password must contain an uppercase letter (organization policy)");
    if (digit && !/[0-9]/.test(password)) throw new AppError("VALIDATION", "Password must contain a digit (organization policy)");
    if (symbol && !/[^A-Za-z0-9]/.test(password)) throw new AppError("VALIDATION", "Password must contain a symbol (organization policy)");
  }

  private async userOrgIds(userId: string) {
    const rows = await this.db.select({ organizationId: schema.organizationMemberships.organizationId }).from(schema.organizationMemberships)
      .where(and(eq(schema.organizationMemberships.userId, userId), isNull(schema.organizationMemberships.deletedAt)));
    return rows.map((r) => r.organizationId);
  }

  /** F02: alert on sign-in from an IP this account has never used before.
   *  Call BEFORE the new session row is created. Fails soft — a mail outage
   *  must never block a login. */
  async flagSuspiciousLogin(userId: string, ip?: string, userAgent?: string) {
    try {
      if (!ip) return;
      const [{ n: total }] = await this.db.select({ n: count() }).from(schema.userSessions).where(eq(schema.userSessions.userId, userId));
      if (Number(total) === 0) return; // first ever session is not suspicious
      const [known] = await this.db.select({ id: schema.userSessions.id }).from(schema.userSessions)
        .where(and(eq(schema.userSessions.userId, userId), eq(schema.userSessions.ip, ip))).limit(1);
      if (known) return;
      const [user] = await this.db.select({ email: schema.users.email, displayName: schema.users.displayName }).from(schema.users).where(eq(schema.users.id, userId)).limit(1);
      if (this.audit) await this.audit.append({ scopeType: "instance", action: "auth.suspicious_login", actorUserId: userId, targetType: "user", targetId: userId, metadata: { ip, userAgent: userAgent ?? null } });
      if (this.mail && user) await this.mail.send(user.email, "[PM] New sign-in to your account",
        `Hi ${user.displayName},\n\nA sign-in to your account just happened from a new address:\n\n  IP: ${ip}\n  Device: ${userAgent ?? "unknown"}\n\nIf this was you, no action is needed. If not, change your password immediately and review your active sessions in Settings.`);
    } catch { /* alerting must never block login */ }
  }

}
