import { Injectable, Inject, Optional } from "@nestjs/common";
import { and, asc, eq, isNull } from "drizzle-orm";
import { schema, type Database } from "@pm/db";
import { AppError } from "@pm/shared";
import { DB } from "../db/db.module.js";
import { ModulesService } from "../modules/modules.service.js";
import { WorkItemsService } from "../work/work-items.service.js";
import { DocumentService } from "../docs/document.service.js";

const CONNECTABLE = new Set(["shape", "note", "frame", "text"]);

@Injectable()
export class WhiteboardService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly modules: ModulesService,
    @Optional() private readonly workItems?: WorkItemsService,
    @Optional() private readonly docs?: DocumentService,
  ) {}

  private enabled(org: string) { return this.modules.assertEnabled(org, "whiteboard"); }

  async createBoard(org: string, userId: string, name: string) {
    await this.enabled(org);
    const [b] = await this.db.insert(schema.whiteboards).values({ organizationId: org, name, createdByUserId: userId }).returning();
    return b;
  }
  async listBoards(org: string) { await this.enabled(org); return this.db.select().from(schema.whiteboards).where(eq(schema.whiteboards.organizationId, org)).orderBy(asc(schema.whiteboards.createdAt)); }

  private async loadBoard(org: string, id: string) {
    const [b] = await this.db.select().from(schema.whiteboards).where(and(eq(schema.whiteboards.id, id), eq(schema.whiteboards.organizationId, org))).limit(1);
    if (!b) throw new AppError("NOT_FOUND", "Whiteboard not found");
    return b;
  }
  async getBoard(org: string, id: string) {
    await this.enabled(org); await this.loadBoard(org, id);
    const elements = await this.db.select().from(schema.whiteboardElements).where(and(eq(schema.whiteboardElements.whiteboardId, id), isNull(schema.whiteboardElements.deletedAt))).orderBy(asc(schema.whiteboardElements.createdAt));
    return { board: await this.loadBoard(org, id), elements };
  }

  private async loadElement(org: string, elementId: string) {
    const [e] = await this.db.select().from(schema.whiteboardElements).where(and(eq(schema.whiteboardElements.id, elementId), eq(schema.whiteboardElements.organizationId, org))).limit(1);
    if (!e) throw new AppError("NOT_FOUND", "Element not found");
    return e;
  }

  async addElement(org: string, boardId: string, input: { kind: string; x?: number; y?: number; w?: number; h?: number; data?: Record<string, unknown> }) {
    await this.enabled(org); await this.loadBoard(org, boardId);
    if (input.kind === "connector") {
      const data = input.data ?? {};
      const from = data.fromId as string | undefined, to = data.toId as string | undefined;
      if (!from || !to) throw new AppError("VALIDATION", "Connector needs fromId and toId");
      for (const ref of [from, to]) {
        const el = await this.loadElement(org, ref).catch(() => null);
        if (!el || el.whiteboardId !== boardId || !CONNECTABLE.has(el.kind)) throw new AppError("VALIDATION", "Connector endpoints must be connectable elements on this board");
      }
    }
    const [e] = await this.db.insert(schema.whiteboardElements).values({ organizationId: org, whiteboardId: boardId, kind: input.kind, x: input.x ?? 0, y: input.y ?? 0, w: input.w ?? 120, h: input.h ?? 80, data: input.data ?? {} }).returning();
    return e;
  }

  async updateElement(org: string, elementId: string, patch: { x?: number; y?: number; w?: number; h?: number; data?: Record<string, unknown> }) {
    await this.enabled(org); await this.loadElement(org, elementId);
    const [e] = await this.db.update(schema.whiteboardElements).set({ ...patch, updatedAt: new Date() }).where(eq(schema.whiteboardElements.id, elementId)).returning();
    return e;
  }
  async deleteElement(org: string, elementId: string) {
    await this.enabled(org); await this.loadElement(org, elementId);
    await this.db.update(schema.whiteboardElements).set({ deletedAt: new Date() }).where(eq(schema.whiteboardElements.id, elementId));
    return { deleted: true };
  }

  /** Convert a note/shape into an authorised work item and link it back. */
  async elementToTask(org: string, userId: string, elementId: string, input: { projectId: string; title?: string }) {
    await this.enabled(org);
    if (!this.workItems) throw new AppError("VALIDATION", "Work item service unavailable");
    const el = await this.loadElement(org, elementId);
    const label = (el.data as { label?: string; text?: string })?.label ?? (el.data as { text?: string })?.text ?? "";
    const title = (input.title ?? label ?? "").toString().slice(0, 200) || "Untitled from whiteboard";
    const item = await this.workItems.create(org, userId, { projectId: input.projectId, title });
    await this.db.update(schema.whiteboardElements).set({ createdWorkItemId: item.id }).where(eq(schema.whiteboardElements.id, elementId));
    return { elementId, workItem: item };
  }

  /** Convert a frame (and the notes/text inside its bounds) into a document. */
  async frameToDoc(org: string, userId: string, frameId: string, input: { title?: string }) {
    await this.enabled(org);
    if (!this.docs) throw new AppError("VALIDATION", "Document service unavailable");
    const frame = await this.loadElement(org, frameId);
    if (frame.kind !== "frame") throw new AppError("VALIDATION", "Element is not a frame");
    const all = await this.db.select().from(schema.whiteboardElements).where(and(eq(schema.whiteboardElements.whiteboardId, frame.whiteboardId), isNull(schema.whiteboardElements.deletedAt)));
    const inside = all.filter((e) => e.id !== frame.id && ["note", "text"].includes(e.kind) && e.x >= frame.x && e.y >= frame.y && e.x <= frame.x + frame.w && e.y <= frame.y + frame.h);
    const blocks = inside.map((e) => ({ type: "text", text: ((e.data as { label?: string; text?: string })?.label ?? (e.data as { text?: string })?.text ?? "").toString() }));
    const title = input.title ?? (frame.data as { label?: string })?.label ?? "Whiteboard frame";
    const doc = await this.docs.create(org, userId, { title, blocks });
    return { frameId, documentId: doc.id, capturedElements: inside.length };
  }
}
