import { Injectable, Inject } from "@nestjs/common";
import { and, eq, gt, isNull, sql } from "drizzle-orm";
import { schema, type Database } from "@pm/db";
import { AppError } from "@pm/shared";
import { DB } from "../db/db.module.js";
import { issueToken, sha256 } from "../common/crypto.js";
import { canAccessWorkItem } from "../collab/access.js";

const MAX_BYTES = Number(process.env.MAX_UPLOAD_BYTES ?? 50 * 1024 * 1024); // 50 MB
const GRANT_TTL_MS = 3 * 60 * 1000; // 3 minutes — short-lived

@Injectable()
export class FilesService {
  constructor(@Inject(DB) private readonly db: Database) {}

  /** Step 1: validate access + limits, create a pending version, issue a single-use UPLOAD grant. */
  async beginUpload(organizationId: string, userId: string, workItemId: string, meta: { filename: string; contentType: string; bytes: number; sha256: string }) {
    if (!(await canAccessWorkItem(this.db, organizationId, workItemId, userId))) throw new AppError("FORBIDDEN", "No access to this work item");
    if (meta.bytes <= 0 || meta.bytes > MAX_BYTES) throw new AppError("VALIDATION", `File exceeds the ${MAX_BYTES}-byte limit`);

    return this.db.transaction(async (tx) => {
      let [att] = await tx.select().from(schema.attachments)
        .where(and(eq(schema.attachments.organizationId, organizationId), eq(schema.attachments.workItemId, workItemId), eq(schema.attachments.filename, meta.filename))).limit(1);
      if (!att) [att] = await tx.insert(schema.attachments).values({ organizationId, workItemId, filename: meta.filename, createdBy: userId }).returning();

      const [{ n }] = await tx.select({ n: sql<number>`coalesce(max(version_no),0)+1` }).from(schema.attachmentVersions).where(eq(schema.attachmentVersions.attachmentId, att.id));
      const versionId = crypto.randomUUID();
      const storageKey = `org/${organizationId}/wi/${workItemId}/${versionId}`;
      await tx.insert(schema.attachmentVersions).values({
        id: versionId, organizationId, attachmentId: att.id, versionNo: n, storageKey,
        contentType: meta.contentType, bytes: meta.bytes, sha256: meta.sha256, status: "pending", uploadedBy: userId,
      });

      const grant = await this.issueGrant(tx as unknown as Database, organizationId, versionId, "upload", userId);
      return { attachmentId: att.id, versionId, storageKey, uploadToken: grant };
    });
  }

  /** Step 2 (called by the gateway after streaming): verify checksum/size, clear quarantine. */
  async completeUpload(versionId: string, actual: { bytes: number; sha256: string }) {
    const [v] = await this.db.select().from(schema.attachmentVersions).where(eq(schema.attachmentVersions.id, versionId)).limit(1);
    if (!v) throw new AppError("NOT_FOUND", "Version not found");
    if (v.bytes !== actual.bytes || v.sha256 !== actual.sha256) {
      await this.db.update(schema.attachmentVersions).set({ status: "infected" }).where(eq(schema.attachmentVersions.id, versionId));
      throw new AppError("VALIDATION", "Checksum/size mismatch; upload rejected");
    }
    await this.db.update(schema.attachmentVersions).set({ status: "clean" }).where(eq(schema.attachmentVersions.id, versionId));
    await this.db.update(schema.attachments).set({ currentVersionId: versionId }).where(eq(schema.attachments.id, v.attachmentId));
  }

  /** Create a single-use, short-lived DOWNLOAD grant (only for clean, accessible versions). */
  async createDownloadGrant(organizationId: string, userId: string, versionId: string) {
    const v = await this.resolveVersion(organizationId, versionId);
    if (v.status !== "clean") throw new AppError("FORBIDDEN", "File is not available for download");
    if (!(await this.canAccessVersion(organizationId, userId, versionId))) throw new AppError("FORBIDDEN", "No access to this file");
    return this.issueGrant(this.db, organizationId, versionId, "download", userId);
  }

  /** Consume a grant atomically. Single-use + expiry + org + purpose all enforced here. */
  async consumeGrant(rawToken: string, purpose: "upload" | "download", organizationId: string, userId: string) {
    const [grant] = await this.db.update(schema.downloadGrants)
      .set({ usedAt: new Date() })
      .where(and(
        eq(schema.downloadGrants.tokenHash, sha256(rawToken)),
        eq(schema.downloadGrants.purpose, purpose),
        eq(schema.downloadGrants.organizationId, organizationId),   // cross-org grant cannot be used
        isNull(schema.downloadGrants.usedAt),                        // single-use
        gt(schema.downloadGrants.expiresAt, new Date()),            // short-lived
      ))
      .returning();
    if (!grant) throw new AppError("FORBIDDEN", "Grant is invalid, expired, already used, or from another organization");

    // Re-check live access at consume time (permission may have changed since issue).
    if (!(await this.canAccessVersion(organizationId, userId, grant.versionId))) throw new AppError("FORBIDDEN", "No access to this file");
    return this.resolveVersion(organizationId, grant.versionId);
  }

  async list(organizationId: string, userId: string, workItemId: string) {
    if (!(await canAccessWorkItem(this.db, organizationId, workItemId, userId))) throw new AppError("FORBIDDEN", "No access to this work item");
    return this.db.select().from(schema.attachments)
      .where(and(eq(schema.attachments.organizationId, organizationId), eq(schema.attachments.workItemId, workItemId), isNull(schema.attachments.deletedAt)));
  }

  private async issueGrant(db: Database, organizationId: string, versionId: string, purpose: "upload" | "download", userId: string) {
    const { raw, hash } = issueToken();
    await db.insert(schema.downloadGrants).values({ organizationId, versionId, purpose, tokenHash: hash, expiresAt: new Date(Date.now() + GRANT_TTL_MS), createdBy: userId });
    return raw;
  }

  private async resolveVersion(organizationId: string, versionId: string) {
    const [v] = await this.db.select().from(schema.attachmentVersions)
      .where(and(eq(schema.attachmentVersions.id, versionId), eq(schema.attachmentVersions.organizationId, organizationId))).limit(1);
    if (!v) throw new AppError("NOT_FOUND", "File version not found");
    return v;
  }

  private async canAccessVersion(organizationId: string, userId: string, versionId: string): Promise<boolean> {
    const [row] = await this.db.select({ workItemId: schema.attachments.workItemId })
      .from(schema.attachmentVersions)
      .innerJoin(schema.attachments, eq(schema.attachments.id, schema.attachmentVersions.attachmentId))
      .where(and(eq(schema.attachmentVersions.id, versionId), eq(schema.attachmentVersions.organizationId, organizationId))).limit(1);
    if (!row) return false;
    return canAccessWorkItem(this.db, organizationId, row.workItemId, userId);
  }
}
