import { pgTable, uuid, text, integer, doublePrecision, boolean, timestamp, index } from "drizzle-orm/pg-core";
import { organizations, users } from "./identity.js";
import { workItems } from "./work.js";
import { formSubmissions } from "./forms.js";

/* ============================================================
 * PROOFING — Phase 10 (assets, immutable versions, markers, reviews)
 * ============================================================ */

export const proofAssets = pgTable("proof_assets", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  workItemId: uuid("work_item_id").references(() => workItems.id),
  name: text("name").notNull(),
  currentVersion: integer("current_version").default(1).notNull(),
  reapprovalOnUpdate: boolean("reapproval_on_update").default(true).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({ byOrg: index("proof_assets_org_idx").on(t.organizationId) }));

export const proofAssetVersions = pgTable("proof_asset_versions", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  assetId: uuid("asset_id").notNull().references(() => proofAssets.id),
  version: integer("version").notNull(),
  fileRef: text("file_ref").notNull(),          // URL / storage key of this immutable version
  mimeType: text("mime_type"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({ byAsset: index("proof_versions_asset_idx").on(t.assetId, t.version) }));

/** A marker is pinned to an exact asset version with normalised (0..1) coordinates. */
export const proofMarkers = pgTable("proof_markers", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  assetId: uuid("asset_id").notNull().references(() => proofAssets.id),
  assetVersion: integer("asset_version").notNull(),
  x: doublePrecision("x").notNull(),            // 0..1 normalised
  y: doublePrecision("y").notNull(),            // 0..1 normalised
  page: integer("page").default(1).notNull(),
  comment: text("comment"),
  authorUserId: uuid("author_user_id").references(() => users.id),
  resolved: boolean("resolved").default(false).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({ byAssetVersion: index("proof_markers_asset_version_idx").on(t.assetId, t.assetVersion) }));

export const proofReviews = pgTable("proof_reviews", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  assetId: uuid("asset_id").notNull().references(() => proofAssets.id),
  assetVersion: integer("asset_version").notNull(),
  status: text("status").default("pending").notNull(), // pending|approved|changes_requested
  reviewerUserId: uuid("reviewer_user_id").references(() => users.id),
  reason: text("reason"),
  decidedAt: timestamp("decided_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({ byAsset: index("proof_reviews_asset_idx").on(t.assetId, t.assetVersion) }));

/** Portal expansion: threaded conversation on a request (form submission). */
export const submissionMessages = pgTable("submission_messages", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  submissionId: uuid("submission_id").notNull().references(() => formSubmissions.id),
  authorKind: text("author_kind").notNull(),    // requester|agent
  authorUserId: uuid("author_user_id").references(() => users.id),
  body: text("body").notNull(),
  at: timestamp("at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({ bySubmission: index("submission_messages_sub_idx").on(t.submissionId, t.at) }));
