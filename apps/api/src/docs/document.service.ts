import { Injectable, Inject, Optional } from "@nestjs/common";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { schema, type Database } from "@pm/db";
import { AppError } from "@pm/shared";
import { DB } from "../db/db.module.js";
import { canAccessWorkItem } from "../collab/access.js";
import { WorkItemsService } from "../work/work-items.service.js";

type Block = { type: string; text?: string; refKind?: string; refId?: string };

@Injectable()
export class DocumentService {
  constructor(@Inject(DB) private readonly db: Database, @Optional() private readonly workItems?: WorkItemsService) {}

  private async nextVersion(documentId: string) {
    const [max] = await this.db.select({ v: schema.documentVersions.version }).from(schema.documentVersions)
      .where(eq(schema.documentVersions.documentId, documentId)).orderBy(desc(schema.documentVersions.version)).limit(1);
    return (max?.v ?? 0) + 1;
  }

  /** Re-derive embed links from block content (keeps the link graph in sync every save). */
  private async syncLinks(organizationId: string, documentId: string, blocks: Block[]) {
    await this.db.delete(schema.documentLinks).where(and(eq(schema.documentLinks.sourceDocumentId, documentId), eq(schema.documentLinks.kind, "embed")));
    const embeds = blocks.filter((b) => b.type === "embed" && b.refKind && b.refId);
    for (const b of embeds) await this.db.insert(schema.documentLinks).values({ organizationId, sourceDocumentId: documentId, targetKind: b.refKind!, targetId: b.refId!, kind: "embed" });
  }

  async create(organizationId: string, userId: string, input: { workspaceId?: string; parentId?: string; title: string; blocks?: Block[] }) {
    const blocks = input.blocks ?? [];
    const [doc] = await this.db.insert(schema.documents).values({ organizationId, workspaceId: input.workspaceId ?? null, parentId: input.parentId ?? null, title: input.title, ownerUserId: userId }).returning();
    const [ver] = await this.db.insert(schema.documentVersions).values({ organizationId, documentId: doc.id, version: 1, title: input.title, blocks, editorUserId: userId }).returning();
    await this.db.update(schema.documents).set({ currentVersionId: ver.id }).where(eq(schema.documents.id, doc.id));
    await this.syncLinks(organizationId, doc.id, blocks);
    return { ...doc, currentVersionId: ver.id, version: 1 };
  }

  /** Versioned autosave: every save writes a new immutable version. */
  async save(organizationId: string, userId: string, documentId: string, input: { title?: string; blocks: Block[] }) {
    const [doc] = await this.db.select().from(schema.documents).where(and(eq(schema.documents.id, documentId), eq(schema.documents.organizationId, organizationId))).limit(1);
    if (!doc) throw new AppError("NOT_FOUND", "Document not found");
    const version = await this.nextVersion(documentId);
    const title = input.title ?? doc.title;
    const [ver] = await this.db.insert(schema.documentVersions).values({ organizationId, documentId, version, title, blocks: input.blocks, editorUserId: userId }).returning();
    await this.db.update(schema.documents).set({ currentVersionId: ver.id, title, updatedAt: new Date() }).where(eq(schema.documents.id, documentId));
    await this.syncLinks(organizationId, documentId, input.blocks);
    return { documentId, version, currentVersionId: ver.id };
  }

  /** Restore: writes a NEW version carrying the old content (history is never mutated). */
  async restore(organizationId: string, userId: string, documentId: string, versionNumber: number) {
    const [target] = await this.db.select().from(schema.documentVersions).where(and(eq(schema.documentVersions.documentId, documentId), eq(schema.documentVersions.version, versionNumber))).limit(1);
    if (!target) throw new AppError("NOT_FOUND", "Version not found");
    const version = await this.nextVersion(documentId);
    const [ver] = await this.db.insert(schema.documentVersions).values({ organizationId, documentId, version, title: target.title, blocks: target.blocks, editorUserId: userId, restoredFrom: versionNumber }).returning();
    await this.db.update(schema.documents).set({ currentVersionId: ver.id, title: target.title, updatedAt: new Date() }).where(eq(schema.documents.id, documentId));
    await this.syncLinks(organizationId, documentId, target.blocks as Block[]);
    return { documentId, version, restoredFrom: versionNumber };
  }

  listVersions(organizationId: string, documentId: string) {
    return this.db.select({ version: schema.documentVersions.version, title: schema.documentVersions.title, editorUserId: schema.documentVersions.editorUserId, restoredFrom: schema.documentVersions.restoredFrom, createdAt: schema.documentVersions.createdAt })
      .from(schema.documentVersions).where(and(eq(schema.documentVersions.organizationId, organizationId), eq(schema.documentVersions.documentId, documentId))).orderBy(desc(schema.documentVersions.version));
  }

  tree(organizationId: string, workspaceId?: string) {
    const conds = [eq(schema.documents.organizationId, organizationId)];
    if (workspaceId) conds.push(eq(schema.documents.workspaceId, workspaceId));
    return this.db.select({ id: schema.documents.id, parentId: schema.documents.parentId, title: schema.documents.title, updatedAt: schema.documents.updatedAt }).from(schema.documents).where(and(...conds)).orderBy(asc(schema.documents.title));
  }

  /** Resolve an embed target for a viewer — work embeds respect item permissions. */
  private async resolveEmbed(organizationId: string, userId: string, refKind: string, refId: string) {
    if (refKind === "work_item") {
      const allowed = await canAccessWorkItem(this.db, organizationId, refId, userId);
      if (!allowed) return { refKind, refId, allowed: false, redacted: true, label: "Restricted item" };
      const [w] = await this.db.select({ key: schema.workItems.key, title: schema.workItems.title, statusCategory: schema.workItems.statusCategory }).from(schema.workItems).where(eq(schema.workItems.id, refId)).limit(1);
      return { refKind, refId, allowed: true, redacted: false, label: w ? `${w.key} ${w.title}` : "", statusCategory: w?.statusCategory };
    }
    if (refKind === "goal") { const [g] = await this.db.select({ name: schema.goals.name }).from(schema.goals).where(eq(schema.goals.id, refId)).limit(1); return { refKind, refId, allowed: true, redacted: false, label: g?.name ?? "" }; }
    if (refKind === "dashboard") { const [d] = await this.db.select({ name: schema.dashboards.name, visibility: schema.dashboards.visibility, owner: schema.dashboards.ownerUserId }).from(schema.dashboards).where(eq(schema.dashboards.id, refId)).limit(1); const allowed = !!d && (d.visibility === "org" || d.owner === userId); return { refKind, refId, allowed, redacted: !allowed, label: allowed ? d!.name : "Restricted dashboard" }; }
    return { refKind, refId, allowed: true, redacted: false, label: "" };
  }

  async get(organizationId: string, userId: string, documentId: string) {
    const [doc] = await this.db.select().from(schema.documents).where(and(eq(schema.documents.id, documentId), eq(schema.documents.organizationId, organizationId))).limit(1);
    if (!doc) throw new AppError("NOT_FOUND", "Document not found");
    const [ver] = await this.db.select().from(schema.documentVersions).where(eq(schema.documentVersions.id, doc.currentVersionId!)).limit(1);
    const blocks = (ver?.blocks as Block[]) ?? [];
    const embeds = [];
    for (const b of blocks.filter((x) => x.type === "embed" && x.refKind && x.refId)) embeds.push(await this.resolveEmbed(organizationId, userId, b.refKind!, b.refId!));
    // backlinks: other docs whose links target this document
    const incoming = await this.db.select().from(schema.documentLinks).where(and(eq(schema.documentLinks.organizationId, organizationId), eq(schema.documentLinks.targetKind, "document"), eq(schema.documentLinks.targetId, documentId)));
    const backlinkDocs = incoming.length ? await this.db.select({ id: schema.documents.id, title: schema.documents.title }).from(schema.documents).where(inArray(schema.documents.id, incoming.map((l) => l.sourceDocumentId))) : [];
    const outgoing = await this.db.select().from(schema.documentLinks).where(eq(schema.documentLinks.sourceDocumentId, documentId));
    return { document: { id: doc.id, title: doc.title, parentId: doc.parentId, version: ver?.version }, blocks, embeds, backlinks: backlinkDocs, outgoingLinks: outgoing.map((l) => ({ targetKind: l.targetKind, targetId: l.targetId, kind: l.kind })) };
  }

  /** Backlinks for any target (e.g. "which docs reference this work item"). */
  async backlinksFor(organizationId: string, targetKind: string, targetId: string) {
    const links = await this.db.select().from(schema.documentLinks).where(and(eq(schema.documentLinks.organizationId, organizationId), eq(schema.documentLinks.targetKind, targetKind), eq(schema.documentLinks.targetId, targetId)));
    if (!links.length) return [];
    return this.db.select({ id: schema.documents.id, title: schema.documents.title }).from(schema.documents).where(inArray(schema.documents.id, links.map((l) => l.sourceDocumentId)));
  }

  /** Selected-text-to-task: create a work item and embed it back into the doc. */
  async selectionToTask(organizationId: string, userId: string, documentId: string, input: { projectId: string; title: string }) {
    if (!this.workItems) throw new AppError("VALIDATION", "Work item service unavailable");
    const [doc] = await this.db.select().from(schema.documents).where(and(eq(schema.documents.id, documentId), eq(schema.documents.organizationId, organizationId))).limit(1);
    if (!doc) throw new AppError("NOT_FOUND", "Document not found");
    const item = await this.workItems.create(organizationId, userId, { projectId: input.projectId, title: input.title });
    const [ver] = await this.db.select().from(schema.documentVersions).where(eq(schema.documentVersions.id, doc.currentVersionId!)).limit(1);
    const blocks = [...((ver?.blocks as Block[]) ?? []), { type: "embed", refKind: "work_item", refId: item.id }];
    await this.save(organizationId, userId, documentId, { blocks });
    return { workItem: item, embeddedIn: documentId };
  }
}
