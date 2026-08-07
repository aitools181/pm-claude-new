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
        await tx.insert(schema.organizationMemberships).values({ organizationId: inv.organizationId, userId: user.id });
      }
      await tx.insert(schema.userRoleAssignments).values({ organizationId: inv.organizationId, userId: user.id, roleKey: inv.roleKey, scopeType: "organization" }).onConflictDoNothing();

      await tx.update(schema.invitations).set({ status: "accepted", acceptedUserId: user.id }).where(eq(schema.invitations.id, inv.id));
      await this.audit.append({ scopeType: "organization", organizationId: inv.organizationId, actorUserId: user.id, action: "invitation.accepted", targetType: "invitation", targetId: inv.id });
      return { userId: user.id, organizationId: inv.organizationId };
    });
  }
}
