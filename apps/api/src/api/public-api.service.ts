import { Injectable, Inject, Optional } from "@nestjs/common";
import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { schema, type Database } from "@pm/db";
import { AppError } from "@pm/shared";
import { DB } from "../db/db.module.js";
import { WorkItemsService } from "../work/work-items.service.js";

const enc = (id: string) => Buffer.from(id).toString("base64url");
const dec = (c: string) => Buffer.from(c, "base64url").toString();

@Injectable()
export class PublicApiService {
  constructor(@Inject(DB) private readonly db: Database, @Optional() private readonly workItems?: WorkItemsService) {}

  /** Keyset-paginated, filterable work item list. */
  async listWorkItems(organizationId: string, opts: { limit?: number; cursor?: string; projectId?: string; status?: string }) {
    const limit = Math.min(Math.max(opts.limit ?? 25, 1), 100);
    const conds = [eq(schema.workItems.organizationId, organizationId), isNull(schema.workItems.deletedAt)];
    if (opts.projectId) conds.push(eq(schema.workItems.owningProjectId, opts.projectId));
    if (opts.status) conds.push(eq(schema.workItems.statusCategory, opts.status));
    if (opts.cursor) { const id = dec(opts.cursor); conds.push(sql`(${schema.workItems.createdAt}, ${schema.workItems.id}) > ((select created_at from work_items where id = ${id}::uuid), ${id}::uuid)`); }
    const rows = await this.db.select({ id: schema.workItems.id, key: schema.workItems.key, title: schema.workItems.title, statusCategory: schema.workItems.statusCategory, projectId: schema.workItems.owningProjectId, createdAt: schema.workItems.createdAt })
      .from(schema.workItems).where(and(...conds)).orderBy(asc(schema.workItems.createdAt), asc(schema.workItems.id)).limit(limit + 1);
    const hasMore = rows.length > limit;
    const data = rows.slice(0, limit);
    const nextCursor = hasMore && data.length ? enc(data[data.length - 1].id) : null;
    return { data: data.map(({ createdAt, ...r }) => r), nextCursor, limit };
  }

  async createWorkItem(organizationId: string, userId: string, input: { projectId: string; title: string }) {
    if (!this.workItems) throw new AppError("VALIDATION", "unavailable");
    const item = await this.workItems.create(organizationId, userId, { projectId: input.projectId, title: input.title });
    return { id: item.id, key: item.key, title: item.title, statusCategory: item.statusCategory };
  }
}
