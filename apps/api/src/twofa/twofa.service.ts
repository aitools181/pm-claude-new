import { Injectable, Inject } from "@nestjs/common";
import { authenticator } from "otplib";
import qrcode from "qrcode";
import { and, eq, isNull } from "drizzle-orm";
import { randomBytes } from "node:crypto";
import { schema, type Database } from "@pm/db";
import { AppError, type Env } from "@pm/shared";
import { DB } from "../db/db.module.js";
import { ENV } from "../config/config.module.js";
import { sha256 } from "../common/crypto.js";
import { deriveKey, encryptSecret, decryptSecret } from "../integrations/crypto.js";

const RECOVERY_CODE_COUNT = 10;

/** TOTP secrets are encrypted at rest with the deployment secret using AES-256-GCM. */
@Injectable()
export class TwoFactorService {
  private readonly key: Buffer;

  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(ENV) env: Env,
  ) {
    this.key = deriveKey(env.SESSION_SECRET);
  }

  private reveal(value: string) {
    try { return decryptSecret(value, this.key); }
    catch { return value; } // compatibility seam for pre-encryption installs
  }

  private normalizeRecoveryCode(code: string) { return code.replace(/[\s-]/g, "").toUpperCase(); }
  private recoveryHash(code: string) { return sha256(`2fa-recovery:${this.normalizeRecoveryCode(code)}`); }

  async beginEnrol(userId: string, email: string) {
    const secret = authenticator.generateSecret();
    const otpauth = authenticator.keyuri(email, "PM Platform", secret);
    const qrDataUrl = await qrcode.toDataURL(otpauth);
    await this.db.update(schema.userCredentials)
      .set({ totpSecretEnc: encryptSecret(secret, this.key), totpEnabled: false, updatedAt: new Date() })
      .where(eq(schema.userCredentials.userId, userId));
    return { qrDataUrl, secret };
  }

  async confirmEnrol(userId: string, code: string) {
    const cred = await this.getCred(userId);
    if (!cred.totpSecretEnc) throw new AppError("VALIDATION", "2FA enrolment has not been started");
    const secret = this.reveal(cred.totpSecretEnc);
    if (!authenticator.check(code, secret)) throw new AppError("VALIDATION", "Invalid 2FA code");
    await this.db.update(schema.userCredentials)
      .set({ totpEnabled: true, totpSecretEnc: encryptSecret(secret, this.key), updatedAt: new Date() })
      .where(eq(schema.userCredentials.userId, userId));
    const recoveryCodes = await this.replaceRecoveryCodes(userId);
    return { enabled: true, recoveryCodes };
  }

  async verify(userId: string, code: string) {
    const cred = await this.getCred(userId);
    if (!cred.totpEnabled || !cred.totpSecretEnc || !authenticator.check(code, this.reveal(cred.totpSecretEnc))) {
      throw new AppError("UNAUTHENTICATED", "Invalid 2FA code");
    }
  }

  async verifyRecoveryCode(userId: string, code: string) {
    const [used] = await this.db.update(schema.twoFactorRecoveryCodes).set({ usedAt: new Date() }).where(and(
      eq(schema.twoFactorRecoveryCodes.userId, userId),
      eq(schema.twoFactorRecoveryCodes.codeHash, this.recoveryHash(code)),
      isNull(schema.twoFactorRecoveryCodes.usedAt),
    )).returning({ id: schema.twoFactorRecoveryCodes.id });
    if (!used) throw new AppError("UNAUTHENTICATED", "Invalid recovery code");
  }

  async regenerateRecoveryCodes(userId: string, currentTotp: string) {
    await this.verify(userId, currentTotp);
    return { recoveryCodes: await this.replaceRecoveryCodes(userId) };
  }

  async disable(userId: string, currentTotp: string) {
    await this.verify(userId, currentTotp);
    await this.db.transaction(async (tx) => {
      await tx.update(schema.userCredentials)
        .set({ totpEnabled: false, totpSecretEnc: null, updatedAt: new Date() })
        .where(eq(schema.userCredentials.userId, userId));
      await tx.delete(schema.twoFactorRecoveryCodes).where(eq(schema.twoFactorRecoveryCodes.userId, userId));
    });
  }

  async status(userId: string) {
    const cred = await this.getCred(userId);
    const available = await this.db.select({ id: schema.twoFactorRecoveryCodes.id })
      .from(schema.twoFactorRecoveryCodes)
      .where(and(eq(schema.twoFactorRecoveryCodes.userId, userId), isNull(schema.twoFactorRecoveryCodes.usedAt)));
    return { enabled: cred.totpEnabled, recoveryCodesRemaining: available.length };
  }

  private async replaceRecoveryCodes(userId: string) {
    const codes = Array.from({ length: RECOVERY_CODE_COUNT }, () => {
      const raw = randomBytes(6).toString("hex").toUpperCase();
      return `${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8, 12)}`;
    });
    await this.db.transaction(async (tx) => {
      await tx.delete(schema.twoFactorRecoveryCodes).where(eq(schema.twoFactorRecoveryCodes.userId, userId));
      await tx.insert(schema.twoFactorRecoveryCodes).values(codes.map((code) => ({
        userId,
        codeHash: this.recoveryHash(code),
      })));
    });
    return codes;
  }

  private async getCred(userId: string) {
    const [cred] = await this.db.select().from(schema.userCredentials)
      .where(eq(schema.userCredentials.userId, userId)).limit(1);
    if (!cred) throw new AppError("NOT_FOUND", "Credentials not found");
    return cred;
  }
}
