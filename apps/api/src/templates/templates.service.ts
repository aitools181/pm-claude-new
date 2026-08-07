import { Injectable, Inject } from "@nestjs/common";
import { and, eq, sql } from "drizzle-orm";
import { schema, type Database } from "@pm/db";
import { AppError } from "@pm/shared";
import { DB } from "../db/db.module.js";
import { ProjectsService } from "../work/projects.service.js";
import { WorkItemsService } from "../work/work-items.service.js";

@Injectable()
export class TemplatesService {
  constructor(@Inject(DB) private readonly db: Database, private readonly projects: ProjectsService, private readonly items: WorkItemsService) {}

  async create(organizationId: string, userId: string, kind: string, name: string, content: unknown) {
    return this.db.transaction(async (tx) => {
      const [tpl] = await tx.insert(schema.templates).values({ organizationId, kind, name, createdBy: userId }).returning();
      const [ver] = await tx.insert(schema.templateVersions).values({ organizationId, templateId: tpl.id, versionNo: 1, status: "draft", content, createdBy: userId }).returning();
      return { template: tpl, version: ver };
    });
  }

  async addVersion(organizationId: string, userId: string, templateId: string, content: unknown) {
    const count = (await this.db.select().from(schema.templateVersions).where(eq(schema.templateVersions.templateId, templateId))).length;
    const [ver] = await this.db.insert(schema.templateVersions).values({ organizationId, templateId, versionNo: count + 1, status: "draft", content, createdBy: userId }).returning();
    return ver;
  }

  async publish(organizationId: string, versionId: string) {
    const [ver] = await this.db.update(schema.templateVersions).set({ status: "published", publishedAt: new Date() })
      .where(and(eq(schema.templateVersions.id, versionId), eq(schema.templateVersions.organizationId, organizationId))).returning();
    if (!ver) throw new AppError("NOT_FOUND", "Version not found");
    await this.db.update(schema.templates).set({ publishedVersionId: versionId }).where(eq(schema.templates.id, ver.templateId));
    return { published: true };
  }

  /**
   * Instantiate a PROJECT template into a real project. The version content is a
   * snapshot: later template edits create new versions and never mutate this instance.
   */
  async instantiateProject(organizationId: string, userId: string, templateId: string, input: { workspaceId: string; name?: string; keyPrefix?: string }) {
    const [tpl] = await this.db.select().from(schema.templates).where(and(eq(schema.templates.id, templateId), eq(schema.templates.organizationId, organizationId))).limit(1);
    if (!tpl?.publishedVersionId) throw new AppError("VALIDATION", "Template has no published version");
    const [ver] = await this.db.select().from(schema.templateVersions).where(eq(schema.templateVersions.id, tpl.publishedVersionId)).limit(1);
    const content = ver!.content as any;

    const project = await this.projects.create(organizationId, userId, {
      workspaceId: input.workspaceId, name: input.name ?? content.name ?? tpl.name, keyPrefix: input.keyPrefix ?? content.keyPrefix ?? "PRJ",
    });
    for (const s of content.sections ?? []) {
      await this.db.insert(schema.sections).values({ organizationId, projectId: project.id, name: s, rank: "n", createdBy: userId });
    }
    const taskIds: string[] = [];
    for (const t of content.tasks ?? []) {
      const item = await this.items.create(organizationId, userId, { projectId: project.id, title: t.title, priority: t.priority });
      taskIds.push(item.id);
    }
    await this.db.insert(schema.templateInstances).values({ organizationId, templateId, versionId: tpl.publishedVersionId, entityType: "project", entityId: project.id });
    return { projectId: project.id, taskIds };
  }

  list(organizationId: string) { return this.db.select().from(schema.templates).where(eq(schema.templates.organizationId, organizationId)); }
}
