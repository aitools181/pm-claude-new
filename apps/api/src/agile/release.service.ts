import { Injectable, Inject } from "@nestjs/common";
import { and, eq, inArray } from "drizzle-orm";
import { schema, type Database } from "@pm/db";
import { AppError } from "@pm/shared";
import { DB } from "../db/db.module.js";

@Injectable()
export class ReleaseService {
  constructor(@Inject(DB) private readonly db: Database) {}

  create(organizationId: string, projectId: string, input: { name: string; version?: string; releaseDate?: string; notes?: string }) {
    return this.db.insert(schema.releases).values({ organizationId, projectId, name: input.name, version: input.version ?? null, releaseDate: input.releaseDate ?? null, notes: input.notes ?? null })
      .returning().then((r) => r[0]);
  }
  list(organizationId: string, projectId: string) {
    return this.db.select().from(schema.releases).where(and(eq(schema.releases.organizationId, organizationId), eq(schema.releases.projectId, projectId))).orderBy(schema.releases.createdAt);
  }
  private async load(organizationId: string, id: string) {
    const [r] = await this.db.select().from(schema.releases).where(and(eq(schema.releases.id, id), eq(schema.releases.organizationId, organizationId))).limit(1);
    if (!r) throw new AppError("NOT_FOUND", "Release not found");
    return r;
  }

  private async includedItems(organizationId: string, releaseId: string) {
    const links = await this.db.select().from(schema.releaseItems).where(and(eq(schema.releaseItems.organizationId, organizationId), eq(schema.releaseItems.releaseId, releaseId)));
    if (!links.length) return [];
    return this.db.select().from(schema.workItems).where(inArray(schema.workItems.id, links.map((l) => l.workItemId)));
  }

  async get(organizationId: string, id: string) {
    const release = await this.load(organizationId, id);
    const items = await this.includedItems(organizationId, id);
    return { release, items: items.map((i) => ({ id: i.id, key: i.key, title: i.title, statusCategory: i.statusCategory })) };
  }

  async addItem(organizationId: string, releaseId: string, workItemId: string) {
    const rel = await this.load(organizationId, releaseId);
    if (rel.status === "released") throw new AppError("CONFLICT", "Release is already published");
    await this.db.insert(schema.releaseItems).values({ organizationId, releaseId, workItemId }).onConflictDoNothing?.() ?? await this.db.insert(schema.releaseItems).values({ organizationId, releaseId, workItemId });
    return { added: true };
  }
  async removeItem(organizationId: string, releaseId: string, workItemId: string) {
    const rel = await this.load(organizationId, releaseId);
    if (rel.status === "released") throw new AppError("CONFLICT", "Release is already published");
    await this.db.delete(schema.releaseItems).where(and(eq(schema.releaseItems.releaseId, releaseId), eq(schema.releaseItems.workItemId, workItemId), eq(schema.releaseItems.organizationId, organizationId)));
    return { removed: true };
  }

  /** Auto-generated notes trace to the included work items. */
  async notes(organizationId: string, releaseId: string) {
    const { release, items } = await this.get(organizationId, releaseId);
    const lines = items.map((i) => `- ${i.key} — ${i.title}`);
    return { release: release.name, version: release.version, generated: lines.join("\n"), custom: release.notes, itemCount: items.length, itemKeys: items.map((i) => i.key) };
  }

  async publish(organizationId: string, releaseId: string) {
    const rel = await this.load(organizationId, releaseId);
    if (rel.status === "released") throw new AppError("CONFLICT", "Already published");
    const [row] = await this.db.update(schema.releases).set({ status: "released", releasedAt: new Date(), releaseDate: rel.releaseDate ?? new Date().toISOString().slice(0, 10) }).where(eq(schema.releases.id, releaseId)).returning();
    return row;
  }
}
