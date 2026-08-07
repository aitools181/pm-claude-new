import { pgTable, uuid, text, timestamp, integer, bigint, uniqueIndex, index } from "drizzle-orm/pg-core";
import { auditColumns } from "./_common.js";
import { organizations, users } from "./identity.js";
import { workItems } from "./work.js";
/* ============================================================
 * ATTACHMENTS + VERSIONS  (private object storage; org-scoped keys)
 * ============================================================ */
export const attachments = pgTable("attachments", {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id").notNull().references(() => organizations.id),
    workItemId: uuid("work_item_id").notNull().references(() => workItems.id),
    filename: text("filename").notNull(),
    currentVersionId: uuid("current_version_id"),
    ...auditColumns,
}, (t) => ({ byItem: index("attachments_item_idx").on(t.workItemId) }));
export const attachmentVersions = pgTable("attachment_versions", {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id").notNull().references(() => organizations.id),
    attachmentId: uuid("attachment_id").notNull().references(() => attachments.id),
    versionNo: integer("version_no").notNull(),
    storageKey: text("storage_key").notNull(), // org-scoped, private
    contentType: text("content_type").notNull(),
    bytes: bigint("bytes", { mode: "number" }).notNull(),
    sha256: text("sha256").notNull(),
    status: text("status").default("pending").notNull(), // pending|clean|infected (quarantine gate)
    uploadedBy: uuid("uploaded_by").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
    attVersionUnique: uniqueIndex("attachment_versions_unique").on(t.attachmentId, t.versionNo),
    keyUnique: uniqueIndex("attachment_versions_key_unique").on(t.storageKey),
}));
/* ============================================================
 * DOWNLOAD / UPLOAD GRANTS  (single-use, short-lived, authenticated gateway)
 * The raw object-storage URL is never the security boundary — grants are.
 * ============================================================ */
export const downloadGrants = pgTable("download_grants", {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id").notNull().references(() => organizations.id),
    versionId: uuid("version_id").notNull().references(() => attachmentVersions.id),
    purpose: text("purpose").notNull(), // upload|download
    tokenHash: text("token_hash").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    createdBy: uuid("created_by").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({ tokenUnique: uniqueIndex("download_grants_token_unique").on(t.tokenHash) }));
//# sourceMappingURL=files.js.map