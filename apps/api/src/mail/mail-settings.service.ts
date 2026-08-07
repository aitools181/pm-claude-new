import { Injectable, Inject, Optional } from "@nestjs/common";
import { eq } from "drizzle-orm";
import nodemailer, { type Transporter } from "nodemailer";
import { schema, type Database } from "@pm/db";
import { AppError } from "@pm/shared";
import { DB } from "../db/db.module.js";
import { ENV } from "../config/config.module.js";
import { deriveKey, encryptSecret, decryptSecret } from "../integrations/crypto.js";

export type MailSettingsInput = {
  host: string; port: number; secure: boolean;
  username?: string | null; password?: string | null;   // blank password = keep the stored one
  fromName: string; fromEmail: string; replyTo?: string | null; enabled: boolean;
};

/** Instance-level SMTP configuration. Secrets are encrypted at rest and never returned. */
@Injectable()
export class MailSettingsService {
  private readonly key: Buffer;
  private transport: Transporter | null = null;
  private transportFingerprint = "";

  constructor(@Inject(DB) private readonly db: Database, @Optional() @Inject(ENV) env?: { SESSION_SECRET: string }) {
    this.key = deriveKey(env?.SESSION_SECRET ?? process.env.SESSION_SECRET ?? "development-secret");
  }

  private async row() {
    const [row] = await this.db.select().from(schema.mailSettings).limit(1);
    return row ?? null;
  }

  /** Safe for the admin UI: reports whether a password is stored, never its value. */
  async get() {
    const r = await this.row();
    if (!r) return null;
    return {
      id: r.id, host: r.host, port: r.port, secure: r.secure, username: r.username,
      hasPassword: Boolean(r.passwordEncrypted),
      fromName: r.fromName, fromEmail: r.fromEmail, replyTo: r.replyTo, enabled: r.enabled,
      lastTestAt: r.lastTestAt, lastTestOk: r.lastTestOk, lastTestError: r.lastTestError, updatedAt: r.updatedAt,
    };
  }

  private validate(input: MailSettingsInput) {
    if (!input.host?.trim()) throw new AppError("VALIDATION", "SMTP host is required");
    if (!Number.isInteger(input.port) || input.port < 1 || input.port > 65535) throw new AppError("VALIDATION", "Port must be between 1 and 65535");
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(input.fromEmail ?? "")) throw new AppError("VALIDATION", "A valid From address is required");
  }

  async save(userId: string, input: MailSettingsInput) {
    this.validate(input);
    const existing = await this.row();
    // An empty password field means "leave the stored secret alone".
    const passwordEncrypted = input.password
      ? encryptSecret(input.password, this.key)
      : existing?.passwordEncrypted ?? null;
    const values = {
      host: input.host.trim(), port: input.port, secure: input.secure,
      username: input.username?.trim() || null, passwordEncrypted,
      fromName: input.fromName?.trim() || "PM Platform", fromEmail: input.fromEmail.trim().toLowerCase(),
      replyTo: input.replyTo?.trim() || null, enabled: input.enabled,
      updatedByUserId: userId, updatedAt: new Date(),
    };
    if (existing) await this.db.update(schema.mailSettings).set(values).where(eq(schema.mailSettings.id, existing.id));
    else await this.db.insert(schema.mailSettings).values(values);
    this.transport = null; // force rebuild with the new configuration
    await this.db.insert(schema.auditEvents).values({ scopeType: "instance", organizationId: null, actorUserId: userId, action: "platform.mail_settings_saved", targetType: "mail", targetId: null, metadata: { host: values.host, port: values.port, enabled: values.enabled } });
    return this.get();
  }

  /** Built transport, or null when SMTP is not configured/enabled (caller falls back to logging). */
  async transporter(): Promise<Transporter | null> {
    const r = await this.row();
    if (!r || !r.enabled) return null;
    const fingerprint = `${r.host}:${r.port}:${r.secure}:${r.username ?? ""}:${r.updatedAt?.toISOString() ?? ""}`;
    if (this.transport && this.transportFingerprint === fingerprint) return this.transport;
    const auth = r.username && r.passwordEncrypted
      ? { user: r.username, pass: decryptSecret(r.passwordEncrypted, this.key) }
      : undefined;
    this.transport = nodemailer.createTransport({ host: r.host, port: r.port, secure: r.secure, auth });
    this.transportFingerprint = fingerprint;
    return this.transport;
  }

  async envelope() {
    const r = await this.row();
    if (!r) return null;
    return { from: `"${r.fromName}" <${r.fromEmail}>`, replyTo: r.replyTo ?? undefined };
  }

  private async recordTest(ok: boolean, error?: string) {
    const r = await this.row();
    if (r) await this.db.update(schema.mailSettings).set({ lastTestAt: new Date(), lastTestOk: ok, lastTestError: error ?? null }).where(eq(schema.mailSettings.id, r.id));
  }

  /** Verifies the connection and sends one message, recording the outcome. */
  async sendTest(userId: string, to: string) {
    const r = await this.row();
    if (!r) throw new AppError("VALIDATION", "Save the SMTP settings before sending a test");
    if (!r.enabled) throw new AppError("VALIDATION", "Enable SMTP delivery before sending a test");
    const tx = await this.transporter();
    if (!tx) throw new AppError("VALIDATION", "SMTP is not configured");
    try {
      await tx.verify();
      const env = await this.envelope();
      await tx.sendMail({ ...env, to, subject: "PM Platform — SMTP test", text: "This is a test message. If you received it, outgoing email is configured correctly." });
      await this.recordTest(true);
      await this.db.insert(schema.auditEvents).values({ scopeType: "instance", organizationId: null, actorUserId: userId, action: "platform.mail_test_sent", targetType: "mail", targetId: null, metadata: { to, ok: true } });
      return { ok: true, to };
    } catch (e) {
      const message = e instanceof Error ? e.message : "Unknown SMTP error";
      await this.recordTest(false, message);
      await this.db.insert(schema.auditEvents).values({ scopeType: "instance", organizationId: null, actorUserId: userId, action: "platform.mail_test_sent", targetType: "mail", targetId: null, metadata: { to, ok: false } });
      throw new AppError("VALIDATION", `SMTP test failed: ${message}`, { code: "smtp_test_failed" });
    }
  }
}
