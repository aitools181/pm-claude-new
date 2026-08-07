import { Injectable, Inject } from "@nestjs/common";
import { and, asc, desc, eq } from "drizzle-orm";
import { schema, type Database } from "@pm/db";
import { AppError } from "@pm/shared";
import { DB } from "../db/db.module.js";

@Injectable()
export class ProofingService {
  constructor(@Inject(DB) private readonly db: Database) {}

  async createAsset(organizationId: string, input: { name: string; fileRef: string; mimeType?: string; workItemId?: string; reapprovalOnUpdate?: boolean }) {
    const [asset] = await this.db.insert(schema.proofAssets).values({ organizationId, name: input.name, workItemId: input.workItemId ?? null, reapprovalOnUpdate: input.reapprovalOnUpdate ?? true, currentVersion: 1 }).returning();
    await this.db.insert(schema.proofAssetVersions).values({ organizationId, assetId: asset.id, version: 1, fileRef: input.fileRef, mimeType: input.mimeType ?? null });
    await this.db.insert(schema.proofReviews).values({ organizationId, assetId: asset.id, assetVersion: 1, status: "pending" });
    return asset;
  }

  list(organizationId: string) { return this.db.select().from(schema.proofAssets).where(eq(schema.proofAssets.organizationId, organizationId)).orderBy(desc(schema.proofAssets.createdAt)); }

  private async load(organizationId: string, assetId: string) {
    const [a] = await this.db.select().from(schema.proofAssets).where(and(eq(schema.proofAssets.id, assetId), eq(schema.proofAssets.organizationId, organizationId))).limit(1);
    if (!a) throw new AppError("NOT_FOUND", "Asset not found");
    return a;
  }

  async get(organizationId: string, assetId: string) {
    const asset = await this.load(organizationId, assetId);
    const versions = await this.db.select().from(schema.proofAssetVersions).where(eq(schema.proofAssetVersions.assetId, assetId)).orderBy(asc(schema.proofAssetVersions.version));
    const [atCurrent] = await this.db.select().from(schema.proofReviews).where(and(eq(schema.proofReviews.assetId, assetId), eq(schema.proofReviews.assetVersion, asset.currentVersion))).orderBy(desc(schema.proofReviews.createdAt)).limit(1);
    // Effective status: prefer a review on the current version, else the most recent overall.
    const [latestOverall] = atCurrent ? [atCurrent] : await this.db.select().from(schema.proofReviews).where(eq(schema.proofReviews.assetId, assetId)).orderBy(desc(schema.proofReviews.createdAt)).limit(1);
    return { asset, versions, currentReview: latestOverall };
  }

  /** New immutable version. If configured, an approved asset requires re-approval. */
  async addVersion(organizationId: string, assetId: string, input: { fileRef: string; mimeType?: string }) {
    const asset = await this.load(organizationId, assetId);
    const version = asset.currentVersion + 1;
    await this.db.insert(schema.proofAssetVersions).values({ organizationId, assetId, version, fileRef: input.fileRef, mimeType: input.mimeType ?? null });
    await this.db.update(schema.proofAssets).set({ currentVersion: version }).where(eq(schema.proofAssets.id, assetId));
    let reapprovalRequired = false;
    if (asset.reapprovalOnUpdate) {
      // Any prior approval is superseded; open a fresh pending review for the new version.
      await this.db.insert(schema.proofReviews).values({ organizationId, assetId, assetVersion: version, status: "pending" });
      reapprovalRequired = true;
    }
    return { assetId, version, reapprovalRequired };
  }

  /** Marker pinned to an exact version with normalised coordinates. */
  async addMarker(organizationId: string, assetId: string, userId: string, input: { assetVersion: number; x: number; y: number; page?: number; comment?: string }) {
    await this.load(organizationId, assetId);
    if (input.x < 0 || input.x > 1 || input.y < 0 || input.y > 1) throw new AppError("VALIDATION", "Coordinates must be normalised 0..1");
    const [m] = await this.db.insert(schema.proofMarkers).values({ organizationId, assetId, assetVersion: input.assetVersion, x: input.x, y: input.y, page: input.page ?? 1, comment: input.comment ?? null, authorUserId: userId }).returning();
    return m;
  }
  listMarkers(organizationId: string, assetId: string, assetVersion: number) {
    return this.db.select().from(schema.proofMarkers).where(and(eq(schema.proofMarkers.organizationId, organizationId), eq(schema.proofMarkers.assetId, assetId), eq(schema.proofMarkers.assetVersion, assetVersion))).orderBy(asc(schema.proofMarkers.createdAt));
  }
  async resolveMarker(organizationId: string, markerId: string, resolved: boolean) {
    const [m] = await this.db.update(schema.proofMarkers).set({ resolved }).where(and(eq(schema.proofMarkers.id, markerId), eq(schema.proofMarkers.organizationId, organizationId))).returning();
    if (!m) throw new AppError("NOT_FOUND", "Marker not found");
    return m;
  }

  /** Compare two versions (refs + marker counts). */
  async compare(organizationId: string, assetId: string, a: number, b: number) {
    await this.load(organizationId, assetId);
    const vers = await this.db.select().from(schema.proofAssetVersions).where(eq(schema.proofAssetVersions.assetId, assetId));
    const pick = (v: number) => vers.find((x) => x.version === v) ?? null;
    const count = async (v: number) => (await this.listMarkers(organizationId, assetId, v)).length;
    return { a: { version: a, file: pick(a), markers: await count(a) }, b: { version: b, file: pick(b), markers: await count(b) } };
  }

  /** Reviewer decision on the current version. */
  async submitReview(organizationId: string, assetId: string, userId: string, input: { assetVersion: number; status: "approved" | "changes_requested"; reason?: string }) {
    await this.load(organizationId, assetId);
    const [existing] = await this.db.select().from(schema.proofReviews).where(and(eq(schema.proofReviews.assetId, assetId), eq(schema.proofReviews.assetVersion, input.assetVersion))).orderBy(desc(schema.proofReviews.createdAt)).limit(1);
    if (existing && existing.status === "pending") {
      const [row] = await this.db.update(schema.proofReviews).set({ status: input.status, reviewerUserId: userId, reason: input.reason ?? null, decidedAt: new Date() }).where(eq(schema.proofReviews.id, existing.id)).returning();
      return row;
    }
    const [row] = await this.db.insert(schema.proofReviews).values({ organizationId, assetId, assetVersion: input.assetVersion, status: input.status, reviewerUserId: userId, reason: input.reason ?? null, decidedAt: new Date() }).returning();
    return row;
  }
}
