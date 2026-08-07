import { Injectable, Inject } from "@nestjs/common";
import { and, eq, isNull } from "drizzle-orm";
import { schema, type Database } from "@pm/db";
import { DB } from "../db/db.module.js";
import { sha256 } from "../common/crypto.js";

type FileEntry = { name: string; count: number; sha256: string; bytes: number };

@Injectable()
export class ExportService {
  constructor(@Inject(DB) private readonly db: Database) {}

  /** Export a project's data as JSON files with a manifest of counts + checksums. */
  async exportProject(organizationId: string, projectId: string) {
    const workItems = await this.db.select().from(schema.workItems)
      .where(and(eq(schema.workItems.organizationId, organizationId), eq(schema.workItems.owningProjectId, projectId), isNull(schema.workItems.deletedAt)))
      .orderBy(schema.workItems.id);
    const workItemIds = workItems.map((w) => w.id);
    const comments = workItemIds.length
      ? (await this.db.select().from(schema.comments).where(and(eq(schema.comments.organizationId, organizationId), isNull(schema.comments.deletedAt)))).filter((c) => workItemIds.includes(c.workItemId))
      : [];

    const files: Record<string, string> = {
      "work_items.json": JSON.stringify(workItems, null, 2),
      "comments.json": JSON.stringify(comments, null, 2),
    };
    const counts: Record<string, number> = { "work_items.json": workItems.length, "comments.json": comments.length };

    const manifestFiles: FileEntry[] = Object.entries(files).map(([name, content]) => ({
      name, count: counts[name], sha256: sha256(content), bytes: Buffer.byteLength(content, "utf8"),
    }));
    const manifest = { version: 1, scope: "project", scopeId: projectId, createdAt: new Date().toISOString(), files: manifestFiles };

    const [job] = await this.db.insert(schema.exportJobs).values({ organizationId, scopeType: "project", scopeId: projectId, status: "completed", manifest }).returning();
    return { jobId: job.id, manifest, files };
  }

  list(organizationId: string) { return this.db.select().from(schema.exportJobs).where(eq(schema.exportJobs.organizationId, organizationId)); }
}
