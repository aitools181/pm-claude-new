import { Injectable, Inject } from "@nestjs/common";
import { and, eq, inArray } from "drizzle-orm";
import { schema, type Database } from "@pm/db";
import { AppError } from "@pm/shared";
import { DB } from "../db/db.module.js";
import { ModulesService } from "../modules/modules.service.js";
import { WorkItemsService } from "../work/work-items.service.js";
import { sha256 } from "../common/crypto.js";
import { normalizeVendorExport, type Vendor } from "./vendor-normalizers.js";

@Injectable()
export class MigrationAssistantsService {
  constructor(@Inject(DB) private readonly db: Database, private readonly modules: ModulesService, private readonly items: WorkItemsService) {}
  private enabled(org: string) { return this.modules.assertEnabled(org, "migration"); }

  async list(org: string) {
    await this.enabled(org);
    const projects = await this.db.select().from(schema.migrationProjects).where(eq(schema.migrationProjects.organizationId, org));
    const batches = await this.db.select().from(schema.migrationBatches).where(eq(schema.migrationBatches.organizationId, org)).limit(100);
    return { projects, batches };
  }

  async create(org: string, userId: string, input: { vendor: Vendor; name: string; sourceMode?: "export" | "api"; sourceConfig?: Record<string, unknown> }) {
    await this.enabled(org);
    const [row] = await this.db.insert(schema.migrationProjects).values({ organizationId: org, vendor: input.vendor, name: input.name, sourceMode: input.sourceMode ?? "export", sourceConfig: input.sourceConfig ?? {}, createdByUserId: userId }).returning();
    return row;
  }

  private async project(org: string, id: string) {
    const [row] = await this.db.select().from(schema.migrationProjects).where(and(eq(schema.migrationProjects.organizationId, org), eq(schema.migrationProjects.id, id))).limit(1);
    if (!row) throw new AppError("NOT_FOUND", "Migration project not found");
    return row;
  }

  async discover(org: string, id: string, source: Record<string, unknown>) {
    await this.enabled(org);
    const project = await this.project(org, id);
    const normalized = normalizeVendorExport(project.vendor as Vendor, source);
    const checksum = sha256(JSON.stringify(source));
    const counts = { projects: normalized.projects.length, users: normalized.users.length, items: normalized.items.length, subtasks: normalized.items.filter((i) => i.type === "subtask").length, unsupportedItems: normalized.items.filter((i) => i.unsupported.length).length };
    const [snapshot] = await this.db.insert(schema.discoverySnapshots).values({ organizationId: org, migrationProjectId: id, counts, supported: normalized.supported, unsupported: [...normalized.unsupported, ...new Set(normalized.items.flatMap((i) => i.unsupported))], sourceChecksum: checksum, sample: normalized.items.slice(0, 10) }).returning();
    await this.db.update(schema.migrationProjects).set({ status: "discovered", updatedAt: new Date() }).where(eq(schema.migrationProjects.id, id));
    return { snapshot, normalized: { projects: normalized.projects, users: normalized.users, sampleItems: normalized.items.slice(0, 25) } };
  }

  async saveMapping(org: string, userId: string, id: string, input: { name: string; mappings: Record<string, unknown> }) {
    await this.enabled(org); await this.project(org, id);
    const [latest] = await this.db.select().from(schema.migrationMappingProfiles).where(eq(schema.migrationMappingProfiles.migrationProjectId, id)).limit(1);
    const [row] = await this.db.insert(schema.migrationMappingProfiles).values({ organizationId: org, migrationProjectId: id, name: input.name, mappings: input.mappings, version: (latest?.version ?? 0) + 1, createdByUserId: userId }).returning();
    await this.db.update(schema.migrationProjects).set({ status: "mapped", updatedAt: new Date() }).where(eq(schema.migrationProjects.id, id));
    return row;
  }

  async run(org: string, userId: string, id: string, input: { mode: "dry_run" | "apply"; source: Record<string, unknown>; mappingProfileId?: string; chunkSize?: number; resumeBatchId?: string }) {
    await this.enabled(org);
    const project = await this.project(org, id);
    const normalized = normalizeVendorExport(project.vendor as Vendor, input.source);
    const checksum = sha256(JSON.stringify(input.source));
    let mapping: Record<string, any> = {};
    if (input.mappingProfileId) {
      const [profile] = await this.db.select().from(schema.migrationMappingProfiles).where(and(eq(schema.migrationMappingProfiles.organizationId, org), eq(schema.migrationMappingProfiles.id, input.mappingProfileId), eq(schema.migrationMappingProfiles.migrationProjectId, id))).limit(1);
      if (!profile) throw new AppError("NOT_FOUND", "Mapping profile not found");
      mapping = profile.mappings as Record<string, any>;
    }
    let cursor = 0; let batchId: string;
    if (input.resumeBatchId) {
      const [existing] = await this.db.select().from(schema.migrationBatches).where(and(eq(schema.migrationBatches.organizationId, org), eq(schema.migrationBatches.id, input.resumeBatchId), eq(schema.migrationBatches.migrationProjectId, id))).limit(1);
      if (!existing) throw new AppError("NOT_FOUND", "Migration batch not found");
      if (existing.sourceChecksum !== checksum) throw new AppError("CONFLICT", "Source changed; this batch cannot be resumed safely");
      cursor = existing.cursor; batchId = existing.id;
      await this.db.update(schema.migrationBatches).set({ status: "running" }).where(eq(schema.migrationBatches.id, batchId));
    } else {
      const [batch] = await this.db.insert(schema.migrationBatches).values({ organizationId: org, migrationProjectId: id, mappingProfileId: input.mappingProfileId, mode: input.mode, status: "running", chunkSize: Math.min(Math.max(input.chunkSize ?? 100, 10), 500), sourceChecksum: checksum, startedByUserId: userId }).returning();
      batchId = batch.id;
    }
    const targetProjectMap = (mapping.projectMap ?? {}) as Record<string, string>;
    const defaultProjectId = mapping.defaultProjectId as string | undefined;
    const existingRefs = await this.db.select().from(schema.migrationSourceReferences).where(and(eq(schema.migrationSourceReferences.organizationId, org), eq(schema.migrationSourceReferences.migrationProjectId, id), eq(schema.migrationSourceReferences.sourceType, "work_item")));
    const refBySource = new Map(existingRefs.map((r) => [r.sourceId, r]));
    const errors: Array<{ sourceId: string; message: string }> = [];
    const created = new Map<string, string>();
    let inserted = 0; let skipped = 0;
    const roots = normalized.items.filter((i) => !i.parentSourceId);
    const children = normalized.items.filter((i) => i.parentSourceId);
    const ordered = [...roots, ...children];
    const chunkSize = Math.min(Math.max(input.chunkSize ?? 100, 10), 500);
    for (let index = cursor; index < ordered.length; index++) {
      const item = ordered[index];
      if (refBySource.has(item.sourceId)) { skipped++; continue; }
      const targetProjectId = targetProjectMap[item.projectSourceId ?? ""] ?? defaultProjectId;
      if (!targetProjectId) { errors.push({ sourceId: item.sourceId, message: "No target project mapping" }); continue; }
      const parentId = item.parentSourceId ? (created.get(item.parentSourceId) ?? refBySource.get(item.parentSourceId)?.workItemId ?? undefined) : undefined;
      if (item.type === "subtask" && !parentId) { errors.push({ sourceId: item.sourceId, message: "Parent was not imported or mapped" }); continue; }
      if (input.mode === "apply") {
        try {
          const createdItem = await this.items.create(org, userId, { projectId: targetProjectId, title: item.title, typeKey: item.type, parentId, description: item.description, priority: ["low", "normal", "high", "urgent"].includes(item.priority ?? "") ? item.priority : "normal", status: item.status });
          created.set(item.sourceId, createdItem.id); inserted++;
          await this.db.insert(schema.migrationSourceReferences).values({ organizationId: org, migrationProjectId: id, sourceType: "work_item", sourceId: item.sourceId, sourceKey: item.sourceKey, sourceUrl: item.sourceUrl, targetType: "work_item", targetId: createdItem.id, workItemId: createdItem.id, metadata: { vendor: project.vendor, archived: item.archived, unsupported: item.unsupported, raw: item.raw } }).onConflictDoNothing();
          if (item.startDate || item.dueDate) await this.db.update(schema.workItems).set({ startDate: item.startDate, dueDate: item.dueDate }).where(eq(schema.workItems.id, createdItem.id));
        } catch (e) { errors.push({ sourceId: item.sourceId, message: e instanceof Error ? e.message : "Import failed" }); }
      } else inserted++;
      if ((index + 1) % chunkSize === 0) await this.db.update(schema.migrationBatches).set({ cursor: index + 1, counts: { inserted, skipped, failed: errors.length } }).where(eq(schema.migrationBatches.id, batchId));
    }
    const counts = { source: ordered.length, inserted, skipped, failed: errors.length, projects: normalized.projects.length, users: normalized.users.length };
    await this.db.update(schema.migrationBatches).set({ status: errors.length && !inserted ? "failed" : "completed", cursor: ordered.length, counts, errors: errors.slice(0, 1000), result: { sourceToTarget: Object.fromEntries(created), unsupported: normalized.unsupported }, finishedAt: new Date() }).where(eq(schema.migrationBatches.id, batchId));
    await this.db.update(schema.migrationProjects).set({ status: input.mode === "apply" ? "completed" : "validated", updatedAt: new Date() }).where(eq(schema.migrationProjects.id, id));
    return { batchId, mode: input.mode, counts, errors, safeToRerun: true };
  }

  async validation(org: string, id: string) {
    await this.enabled(org); await this.project(org, id);
    const [snapshots, batches, refs] = await Promise.all([
      this.db.select().from(schema.discoverySnapshots).where(eq(schema.discoverySnapshots.migrationProjectId, id)),
      this.db.select().from(schema.migrationBatches).where(eq(schema.migrationBatches.migrationProjectId, id)),
      this.db.select().from(schema.migrationSourceReferences).where(eq(schema.migrationSourceReferences.migrationProjectId, id)),
    ]);
    const sourceCount = Number((snapshots.at(-1)?.counts as any)?.items ?? 0);
    return { sourceCount, importedReferences: refs.length, difference: sourceCount - refs.length, batches, reconciled: sourceCount === 0 || sourceCount === refs.length };
  }
}
