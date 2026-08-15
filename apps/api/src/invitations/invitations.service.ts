import { Injectable, Inject } from "@nestjs/common";
import { and, eq, isNull } from "drizzle-orm";
import { schema, type Database } from "@pm/db";
import { AppError } from "@pm/shared";
import { DB } from "../db/db.module.js";
import { issueToken, sha256, hashPassword } from "../common/crypto.js";
import { AuditService } from "../audit/audit.service.js";
import { MailService } from "../mail/mail.service.js";

const TTL_MS = 1000 * 60 * 60 * 24 * 7; // 7 days

@Injectable()
export class InvitationsService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly audit: AuditService,
    private readonly mail: MailService,
  ) {}

  async create(organizationId: string, invitedBy: string, email: string, roleKey: string, correlationId?: string) {
    const { raw, hash } = issueToken();
    const [inv] = await this.db.insert(schema.invitations).values({
      organizationId, email: email.toLowerCase(), roleKey, tokenHash: hash,
      expiresAt: new Date(Date.now() + TTL_MS), invitedBy, createdBy: invitedBy,
    }).returning();

    await this.mail.send(email, "You're invited", `Accept: /invite/accept?token=${raw}`);
    await this.audit.append({
      scopeType: "organization", organizationId, actorUserId: invitedBy,
      action: "invitation.created", targetType: "invitation", targetId: inv.id, correlationId,
    });
    return { id: inv.id };
  }

  list(organizationId: string) {
    return this.db.select().from(schema.invitations)
      .where(and(eq(schema.invitations.organizationId, organizationId), isNull(schema.invitations.deletedAt)));
  }

  private async classify(organizationId: string, email: string): Promise<"ok" | "already_member" | "already_invited" | "invalid_email"> {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return "invalid_email";
    const lower = email.toLowerCase();
    const [member] = await this.db.select({ id: schema.organizationMemberships.id }).from(schema.organizationMemberships)
      .innerJoin(schema.users, eq(schema.users.id, schema.organizationMemberships.userId))
      .where(and(eq(schema.organizationMemberships.organizationId, organizationId), eq(schema.users.email, lower), isNull(schema.organizationMemberships.deletedAt))).limit(1);
    if (member) return "already_member";
    const [pending] = await this.db.select({ id: schema.invitations.id }).from(schema.invitations)
      .where(and(eq(schema.invitations.organizationId, organizationId), eq(schema.invitations.email, lower), isNull(schema.invitations.deletedAt), eq(schema.invitations.status, "pending"))).limit(1);
    if (pending) return "already_invited";
    return "ok";
  }

  /** F03 bulk invitation: dedupes within the batch and against members/pending invites. */
  async createBulk(organizationId: string, invitedBy: string, emails: string[], roleKey: string, correlationId?: string) {
    const seen = new Set<string>();
    const report: { email: string; status: string; invitationId?: string }[] = [];
    for (const raw of emails) {
      const email = raw.trim().toLowerCase();
      if (!email) continue;
      if (seen.has(email)) { report.push({ email, status: "duplicate_in_batch" }); continue; }
      seen.add(email);
      const status = await this.classify(organizationId, email);
      if (status !== "ok") { report.push({ email, status }); continue; }
      try {
        const created = await this.create(organizationId, invitedBy, email, roleKey, correlationId);
        report.push({ email, status: "invited", invitationId: created.id });
      } catch { report.push({ email, status: "error" }); }
    }
    const invited = report.filter((r) => r.status === "invited").length;
    return { invited, total: report.length, report };
  }

  /**
   * F03 CSV user import. Accepts `email,displayName,roleKey` rows (header optional),
   * validates every row, invites the valid ones, and returns a per-row report plus a
   * failed-rows CSV the admin can download, correct and re-upload.
   */
  async importCsv(organizationId: string, invitedBy: string, csv: string, defaultRoleKey: string, correlationId?: string) {
    const validRoles = new Set((await this.db.select({ key: schema.roles.key }).from(schema.roles)
      .where(eq(schema.roles.organizationId, organizationId))).map((r) => r.key));
    const lines = csv.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    if (lines.length && /^email\b/i.test(lines[0])) lines.shift();
    if (!lines.length) return { invited: 0, total: 0, report: [], failedCsv: "" };
    if (lines.length > 500) return { invited: 0, total: lines.length, report: [], failedCsv: "", error: "A maximum of 500 rows per import is supported" };

    const seen = new Set<string>();
    const report: { row: number; email: string; displayName?: string; roleKey: string; status: string }[] = [];
    let rowNo = 0;
    for (const line of lines) {
      rowNo += 1;
      const [emailRaw = "", displayName = "", roleRaw = ""] = line.split(",").map((c) => c.trim().replace(/^"|"$/g, ""));
      const email = emailRaw.toLowerCase();
      const roleKey = roleRaw || defaultRoleKey;
      const entry = { row: rowNo, email, displayName: displayName || undefined, roleKey, status: "" };
      if (!email) { entry.status = "missing_email"; report.push(entry); continue; }
      if (seen.has(email)) { entry.status = "duplicate_in_file"; report.push(entry); continue; }
      seen.add(email);
      if (!validRoles.has(roleKey)) { entry.status = "unknown_role"; report.push(entry); continue; }
      entry.status = await this.classify(organizationId, email);
      if (entry.status !== "ok") { report.push(entry); continue; }
      try {
        await this.create(organizationId, invitedBy, email, roleKey, correlationId);
        entry.status = "invited";
      } catch { entry.status = "error"; }
      report.push(entry);
    }
    const failed = report.filter((r) => r.status !== "invited" && r.status !== "already_member");
    const failedCsv = failed.length
      ? ["email,displayName,roleKey,reason", ...failed.map((r) => `${r.email},${r.displayName ?? ""},${r.roleKey},${r.status}`)].join("\n")
      : "";
    await this.audit.append({ scopeType: "organization", organizationId, actorUserId: invitedBy, action: "users.csv_import", targetType: "invitation", correlationId: correlationId ?? null, metadata: { rows: report.length, invited: report.filter((r) => r.status === "invited").length, failed: failed.length } });
    return { invited: report.filter((r) => r.status === "invited").length, total: report.length, report, failedCsv };
  }

  async revoke(organizationId: string, id: string, actorUserId: string, correlationId?: string) {
    const [inv] = await this.db.update(schema.invitations)
      .set({ status: "revoked" })
      .where(and(eq(schema.invitations.id, id), eq(schema.invitations.organizationId, organizationId), eq(schema.invitations.status, "pending")))
      .returning();
    if (!inv) throw new AppError("NOT_FOUND", "No pending invitation to revoke");
    await this.audit.append({ scopeType: "organization", organizationId, actorUserId, action: "invitation.revoked", targetType: "invitation", targetId: id, correlationId });
  }

  async resend(organizationId: string, id: string, actorUserId: string) {
    const { raw, hash } = issueToken();
    const [inv] = await this.db.update(schema.invitations)
      .set({ tokenHash: hash, expiresAt: new Date(Date.now() + TTL_MS) })
      .where(and(eq(schema.invitations.id, id), eq(schema.invitations.organizationId, organizationId), eq(schema.invitations.status, "pending")))
      .returning();
    if (!inv) throw new AppError("NOT_FOUND", "No pending invitation to resend");
    await this.mail.send(inv.email, "Your invitation (resent)", `Accept: /invite/accept?token=${raw}`);
    await this.audit.append({ scopeType: "organization", organizationId, actorUserId, action: "invitation.resent", targetType: "invitation", targetId: id });
  }

  /** Public accept. Creates membership for an existing user, or a new user + credentials. */
  async accept(rawToken: string, newUser?: { displayName: string; password: string }) {
    return this.db.transaction(async (tx) => {
      const [inv] = await tx.select().from(schema.invitations).where(
        and(eq(schema.invitations.tokenHash, sha256(rawToken)), eq(schema.invitations.status, "pending")),
      ).limit(1);
      if (!inv) throw new AppError("VALIDATION", "Invalid invitation");
      // F02: enforce the inviting organization's password policy on new accounts.
      if (newUser?.password) {
        const [settings] = await tx.select({ policy: schema.organizationSettings.passwordPolicy }).from(schema.organizationSettings)
          .where(eq(schema.organizationSettings.organizationId, inv.organizationId)).limit(1);
        const pol = (settings?.policy ?? {}) as { minLength?: number; requireUppercase?: boolean; requireDigit?: boolean; requireSymbol?: boolean };
        const minLength = Math.max(10, Number(pol.minLength) || 10);
        if (newUser.password.length < minLength) throw new AppError("VALIDATION", `Password must be at least ${minLength} characters (organization policy)`);
        if (pol.requireUppercase && !/[A-Z]/.test(newUser.password)) throw new AppError("VALIDATION", "Password must contain an uppercase letter (organization policy)");
        if (pol.requireDigit && !/[0-9]/.test(newUser.password)) throw new AppError("VALIDATION", "Password must contain a digit (organization policy)");
        if (pol.requireSymbol && !/[^A-Za-z0-9]/.test(newUser.password)) throw new AppError("VALIDATION", "Password must contain a symbol (organization policy)");
      }
      if (inv.expiresAt < new Date()) {
        await tx.update(schema.invitations).set({ status: "expired" }).where(eq(schema.invitations.id, inv.id));
        throw new AppError("VALIDATION", "Invitation has expired");
      }

      let [user] = await tx.select().from(schema.users).where(eq(schema.users.email, inv.email)).limit(1);
      if (!user) {
        if (!newUser) throw new AppError("VALIDATION", "New account details required");
        [user] = await tx.insert(schema.users).values({ email: inv.email, displayName: newUser.displayName }).returning();
        await tx.insert(schema.userCredentials).values({ userId: user.id, passwordHash: await hashPassword(newUser.password) });
      }

      // Idempotent membership creation.
      const [existing] = await tx.select().from(schema.organizationMemberships).where(and(
        eq(schema.organizationMemberships.organizationId, inv.organizationId),
        eq(schema.organizationMemberships.userId, user.id),
      )).limit(1);
      if (!existing) {
        await tx.insert(schema.organizationMemberships).values({ organizationId: inv.organizationId, userId: user.id, accountType: inv.roleKey === "guest" ? "guest" : "member" });
      }
      await tx.insert(schema.userRoleAssignments).values({ organizationId: inv.organizationId, userId: user.id, roleKey: inv.roleKey, scopeType: "organization" }).onConflictDoNothing();

      await tx.update(schema.invitations).set({ status: "accepted", acceptedUserId: user.id }).where(eq(schema.invitations.id, inv.id));
      await this.audit.append({ scopeType: "organization", organizationId: inv.organizationId, actorUserId: user.id, action: "invitation.accepted", targetType: "invitation", targetId: inv.id });
      return { userId: user.id, organizationId: inv.organizationId };
    });
  }
}
