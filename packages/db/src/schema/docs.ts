import { pgTable, uuid, text, integer, timestamp, jsonb, index } from "drizzle-orm/pg-core";
import { organizations, users } from "./identity.js";
import { workspaces } from "./work.js";

/* ============================================================
 * DOCS / WIKI — Phase 10 (page tree, versioned blocks, link graph)
 * ============================================================ */

export const documents = pgTable("documents", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  workspaceId: uuid("workspace_id").references(() => workspaces.id),
  parentId: uuid("parent_id"),                       // page tree
  title: text("title").notNull(),
  ownerUserId: uuid("owner_user_id").references(() => users.id),
  visibility: text("visibility").default("inherit").notNull(), // inherit|workspace|private
  currentVersionId: uuid("current_version_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({ byTree: index("documents_tree_idx").on(t.organizationId, t.parentId) }));

/** Immutable version snapshots (versioned autosave, restore-safe). */
export const documentVersions = pgTable("document_versions", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  documentId: uuid("document_id").notNull().references(() => documents.id),
  version: integer("version").notNull(),
  title: text("title").notNull(),
  blocks: jsonb("blocks").default([]).notNull(),     // [{type,text?,refKind?,refId?}]
  editorUserId: uuid("editor_user_id").references(() => users.id),
  restoredFrom: integer("restored_from"),            // version number this was restored from
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({ byDoc: index("document_versions_doc_idx").on(t.documentId, t.version) }));

/** Link graph: doc → work_item | goal | dashboard | document. Backlinks = reverse lookup. */
export const documentLinks = pgTable("document_links", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  sourceDocumentId: uuid("source_document_id").notNull().references(() => documents.id),
  targetKind: text("target_kind").notNull(),         // work_item|goal|dashboard|document
  targetId: uuid("target_id").notNull(),
  kind: text("kind").default("embed").notNull(),     // embed|mention|backlink
}, (t) => ({ bySource: index("document_links_source_idx").on(t.sourceDocumentId), byTarget: index("document_links_target_idx").on(t.organizationId, t.targetKind, t.targetId) }));
