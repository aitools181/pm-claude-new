import { Injectable, Inject } from "@nestjs/common";
import { and, eq, isNull, sql } from "drizzle-orm";
import { schema, type Database } from "@pm/db";
import { AppError } from "@pm/shared";
import { DB } from "../db/db.module.js";

const SLA_DAYS: Record<string, number> = {
  access: 30, portability: 30, rectification: 30, erasure: 30, restriction: 14, objection: 14,
};

@Injectable()
export class PrivacyService {
  constructor(@Inject(DB) private readonly db: Database) {}

  // ---- I.3.1 Data Subject Requests ----

  async createDsr(organizationId: string, requestedByUserId: string, input: { subjectUserId: string; requestType: string; notes?: string }) {
    const days = SLA_DAYS[input.requestType] ?? 30;
    const [row] = await this.db.insert(schema.dataSubjectRequests).values({
      organizationId, subjectUserId: input.subjectUserId, requestedByUserId, requestType: input.requestType,
      slaDeadline: new Date(Date.now() + days * 86_400_000), notes: input.notes ?? null,
    }).returning();
    return row;
  }

  listDsr(organizationId: string, status?: string) {
    const conditions = [eq(schema.dataSubjectRequests.organizationId, organizationId)];
    if (status) conditions.push(eq(schema.dataSubjectRequests.status, status));
    return this.db.select().from(schema.dataSubjectRequests).where(and(...conditions)).orderBy(schema.dataSubjectRequests.slaDeadline);
  }

  async setDsrStatus(organizationId: string, id: string, status: string) {
    const patch: Record<string, unknown> = { status, updatedAt: new Date() };
    if (status === "verifying") patch.verifiedAt = new Date();
    if (status === "completed") patch.completedAt = new Date();
    const [row] = await this.db.update(schema.dataSubjectRequests).set(patch)
      .where(and(eq(schema.dataSubjectRequests.id, id), eq(schema.dataSubjectRequests.organizationId, organizationId))).returning();
    if (!row) throw new AppError("NOT_FOUND", "Request not found");
    return row;
  }

  /**
   * I.3.1.3 — export bundle: subject-owned profile, work items they own/reported,
   * comments they authored, and org memberships — machine-readable + a human index.
   * Third-party personal data (other people's names) is limited to display-name
   * references already visible to the subject through normal product access.
   */
  async exportSubjectData(organizationId: string, dsrId: string, subjectUserId: string) {
    const [profile] = await this.db.select({
      id: schema.users.id, email: schema.users.email, displayName: schema.users.displayName,
      designation: schema.users.designation, department: schema.users.department, contactFields: schema.users.contactFields,
    }).from(schema.users).where(eq(schema.users.id, subjectUserId)).limit(1);
    if (!profile) throw new AppError("NOT_FOUND", "Subject not found");

    const workItems = await this.db.select({ id: schema.workItems.id, key: schema.workItems.key, title: schema.workItems.title, createdAt: schema.workItems.createdAt })
      .from(schema.workItems).where(and(eq(schema.workItems.organizationId, organizationId), eq(schema.workItems.reporterUserId, subjectUserId)));
    const comments = await this.db.select({ id: schema.comments.id, workItemId: schema.comments.workItemId, body: schema.comments.body, createdAt: schema.comments.createdAt })
      .from(schema.comments).where(and(eq(schema.comments.organizationId, organizationId), eq(schema.comments.authorUserId, subjectUserId)));
    const memberships = await this.db.select({ id: schema.organizationMemberships.id, status: schema.organizationMemberships.status, createdAt: schema.organizationMemberships.createdAt })
      .from(schema.organizationMemberships).where(and(eq(schema.organizationMemberships.organizationId, organizationId), eq(schema.organizationMemberships.userId, subjectUserId)));

    const manifest = {
      generatedAt: new Date().toISOString(),
      counts: { workItems: workItems.length, comments: comments.length, memberships: memberships.length },
      humanIndex: [
        `Profile: ${profile.displayName} (${profile.email})`,
        `${workItems.length} work item(s) you reported`,
        `${comments.length} comment(s) you authored`,
        `${memberships.length} organization membership record(s)`,
      ],
    };
    await this.db.update(schema.dataSubjectRequests).set({ exportManifest: manifest, updatedAt: new Date() }).where(eq(schema.dataSubjectRequests.id, dsrId));
    return { manifest, data: { profile, workItems, comments, memberships } };
  }

  /** I.3.1.5 — erasure plan preview: what would be deleted vs anonymised vs retained-by-legal-basis, before any mutation. */
  async erasurePreview(organizationId: string, subjectUserId: string) {
    const holds = await this.activeHoldsForUser(organizationId, subjectUserId);
    const [{ n: workItemCount }] = await this.db.select({ n: sql<number>`count(*)::int` }).from(schema.workItems)
      .where(and(eq(schema.workItems.organizationId, organizationId), eq(schema.workItems.reporterUserId, subjectUserId)));
    const [{ n: commentCount }] = await this.db.select({ n: sql<number>`count(*)::int` }).from(schema.comments)
      .where(and(eq(schema.comments.organizationId, organizationId), eq(schema.comments.authorUserId, subjectUserId)));
    return {
      willAnonymise: { profile: true, workItemsAuthored: Number(workItemCount), commentsAuthored: Number(commentCount) },
      willRetainByLegalBasis: holds.length > 0,
      activeHolds: holds.map((h) => ({ id: h.id, scope: h.scope, reason: h.reason })),
    };
  }

  // ---- I.3.3 Legal Hold ----

  async createHold(organizationId: string, createdByUserId: string, input: { scope: string; scopeUserId?: string; scopeProjectId?: string; dateFrom?: string; dateTo?: string; reason: string }) {
    if (input.scope === "user" && !input.scopeUserId) throw new AppError("VALIDATION", "A user-scoped hold requires scopeUserId");
    if (input.scope === "project" && !input.scopeProjectId) throw new AppError("VALIDATION", "A project-scoped hold requires scopeProjectId");
    if (input.scope === "date_range" && !(input.dateFrom && input.dateTo)) throw new AppError("VALIDATION", "A date-range hold requires dateFrom and dateTo");
    const [row] = await this.db.insert(schema.legalHolds).values({
      organizationId, scope: input.scope, scopeUserId: input.scopeUserId ?? null, scopeProjectId: input.scopeProjectId ?? null,
      dateFrom: input.dateFrom ?? null, dateTo: input.dateTo ?? null, reason: input.reason, createdByUserId,
    }).returning();
    return row;
  }

  listHolds(organizationId: string) {
    return this.db.select().from(schema.legalHolds).where(eq(schema.legalHolds.organizationId, organizationId)).orderBy(schema.legalHolds.createdAt);
  }

  /** I.3.3.2 — release requires a distinct approver from whoever requests it; retention countdown resumes deterministically. */
  async releaseHold(organizationId: string, id: string, releasedByUserId: string, approvedByUserId: string) {
    if (releasedByUserId === approvedByUserId) throw new AppError("VALIDATION", "Hold release requires a separate approver");
    const [row] = await this.db.update(schema.legalHolds).set({ releasedAt: new Date(), releasedByUserId, releaseApprovedByUserId: approvedByUserId })
      .where(and(eq(schema.legalHolds.id, id), eq(schema.legalHolds.organizationId, organizationId), isNull(schema.legalHolds.releasedAt))).returning();
    if (!row) throw new AppError("NOT_FOUND", "Active hold not found");
    return row;
  }

  private async activeHolds(organizationId: string) {
    return this.db.select().from(schema.legalHolds).where(and(eq(schema.legalHolds.organizationId, organizationId), isNull(schema.legalHolds.releasedAt)));
  }

  private async activeHoldsForUser(organizationId: string, userId: string) {
    const holds = await this.activeHolds(organizationId);
    return holds.filter((h) => h.scope === "user" && h.scopeUserId === userId);
  }

  /** Used by retention purge (X01/X04) — true if this deleted work item is protected by any active hold. */
  async isUnderLegalHold(organizationId: string, item: { primaryOwnerUserId?: string | null; reporterUserId?: string | null; owningProjectId: string; deletedAt: Date | null }) {
    const holds = await this.activeHolds(organizationId);
    if (!holds.length) return false;
    return holds.some((h) => {
      if (h.scope === "user") return h.scopeUserId === item.primaryOwnerUserId || h.scopeUserId === item.reporterUserId;
      if (h.scope === "project") return h.scopeProjectId === item.owningProjectId;
      if (h.scope === "date_range" && item.deletedAt && h.dateFrom && h.dateTo) {
        const d = item.deletedAt.toISOString().slice(0, 10);
        return d >= h.dateFrom && d <= h.dateTo;
      }
      return false;
    });
  }

  // ---- I.3.4 Consent register ----

  async recordConsent(organizationId: string, userId: string, purpose: string, version: string) {
    const [row] = await this.db.insert(schema.consentRecords).values({ organizationId, userId, purpose, version }).returning();
    return row;
  }
  async withdrawConsent(organizationId: string, userId: string, purpose: string) {
    await this.db.update(schema.consentRecords).set({ withdrawnAt: new Date() })
      .where(and(eq(schema.consentRecords.organizationId, organizationId), eq(schema.consentRecords.userId, userId), eq(schema.consentRecords.purpose, purpose), isNull(schema.consentRecords.withdrawnAt)));
    return { ok: true };
  }
  listConsent(organizationId: string, userId: string) {
    return this.db.select().from(schema.consentRecords).where(and(eq(schema.consentRecords.organizationId, organizationId), eq(schema.consentRecords.userId, userId))).orderBy(schema.consentRecords.grantedAt);
  }

  // ---- I.3.2 Anonymisation ----

  /**
   * Irreversible: identity fields are replaced (not deleted — comments/work items
   * keep valid foreign keys and remain attributable to "Deleted user <shortId>").
   * Sessions are revoked; contact fields cleared. Free-text (comment bodies) is
   * NOT auto-rewritten — X01.3.3 (referenced in blueprint) requires a review
   * queue for that, which is out of scope for this pass and left untouched.
   */
  async anonymise(organizationId: string, targetUserId: string, performedByUserId: string, dsrRequestId?: string) {
    const holds = await this.activeHoldsForUser(organizationId, targetUserId);
    if (holds.length) throw new AppError("CONFLICT", "This person is under an active legal hold and cannot be anonymised", { code: "legal_hold_blocks_erasure" });
    const [user] = await this.db.select().from(schema.users).where(eq(schema.users.id, targetUserId)).limit(1);
    if (!user) throw new AppError("NOT_FOUND", "User not found");
    const shortId = targetUserId.slice(0, 8);
    const fieldsAffected = ["email", "displayName", "username", "avatarUrl", "designation", "department", "contactFields", "workingHours", "sessions"];
    await this.db.transaction(async (tx) => {
      await tx.update(schema.users).set({
        email: `deleted-${shortId}@anonymised.invalid`, displayName: `Deleted user ${shortId}`, username: null,
        avatarUrl: null, designation: null, department: null, contactFields: null, workingHours: null,
      }).where(eq(schema.users.id, targetUserId));
      await tx.delete(schema.userSessions).where(eq(schema.userSessions.userId, targetUserId));
      await tx.insert(schema.anonymisationRuns).values({ organizationId, targetUserId, performedByUserId, fieldsAffected, dsrRequestId: dsrRequestId ?? null });
      await tx.insert(schema.auditEvents).values({
        scopeType: "organization", organizationId, actorUserId: performedByUserId, action: "privacy.user_anonymised",
        targetType: "user", targetId: targetUserId, metadata: { fieldsAffected, dsrRequestId: dsrRequestId ?? null },
      });
    });
    return { anonymised: true, fieldsAffected };
  }

  listAnonymisationRuns(organizationId: string) {
    return this.db.select().from(schema.anonymisationRuns).where(eq(schema.anonymisationRuns.organizationId, organizationId)).orderBy(schema.anonymisationRuns.performedAt);
  }
}
