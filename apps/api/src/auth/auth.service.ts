import { Injectable, Inject } from "@nestjs/common";
import { and, eq, sql } from "drizzle-orm";
import { schema, type Database } from "@pm/db";
import { AppError } from "@pm/shared";
import { DB } from "../db/db.module.js";
import { hashPassword, sha256, verifyPassword } from "../common/crypto.js";
import { TokenService } from "./token.service.js";
import { SessionService } from "./session.service.js";
import { MailService } from "../mail/mail.service.js";

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

  /** Verifies credentials and enforces database-backed lockout. */
  async verifyCredentials(email: string, password: string, ip?: string) {
    const normalizedEmail = email.trim().toLowerCase();
    this.checkRate(normalizedEmail, ip);

    const [user] = await this.db.select().from(schema.users)
      .where(eq(schema.users.email, normalizedEmail)).limit(1);
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
}
