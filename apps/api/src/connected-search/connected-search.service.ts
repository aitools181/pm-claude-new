import { Injectable, Inject } from "@nestjs/common";
import { and, eq, gt, ilike, isNull, or } from "drizzle-orm";
import { schema, type Database } from "@pm/db";
import { AppError } from "@pm/shared";
import { DB } from "../db/db.module.js";
import { ModulesService } from "../modules/modules.service.js";
import { sha256 } from "../common/crypto.js";

export type ExternalDocument = { externalId: string; sourceType: string; title: string; snippet?: string; deepLink?: string; content?: string; metadata?: Record<string, unknown>; principals?: string[]; sourceVersion?: string; sourceUpdatedAt?: string };

@Injectable()
export class ConnectedSearchService {
  constructor(@Inject(DB) private readonly db: Database, private readonly modules: ModulesService) {}
  private enabled(org: string) { return this.modules.assertEnabled(org, "connected_search"); }

  async list(org: string) {
    await this.enabled(org);
    const [connectors, scopes, runs] = await Promise.all([
      this.db.select().from(schema.searchConnectors).where(eq(schema.searchConnectors.organizationId, org)),
      this.db.select().from(schema.connectorScopes).where(eq(schema.connectorScopes.organizationId, org)),
      this.db.select().from(schema.crawlRuns).where(eq(schema.crawlRuns.organizationId, org)).limit(100),
    ]);
    return { connectors, scopes, runs };
  }

  async createConnector(org: string, userId: string, input: { integrationId?: string; kind: string; name: string; mode?: "indexed" | "live"; scheduleCron?: string; retentionDays?: number; config?: Record<string, unknown> }) {
    await this.enabled(org);
    const allowed = ["google_drive", "sharepoint", "onedrive", "slack", "teams", "github", "gitlab", "email", "documents", "generic"];
    if (!allowed.includes(input.kind)) throw new AppError("VALIDATION", "Unsupported search connector kind");
    const [row] = await this.db.insert(schema.searchConnectors).values({ organizationId: org, integrationId: input.integrationId, kind: input.kind, name: input.name, mode: input.mode ?? "indexed", scheduleCron: input.scheduleCron, retentionDays: input.retentionDays ?? 30, config: input.config ?? {}, createdByUserId: userId }).returning();
    return row;
  }

  async addScope(org: string, connectorId: string, input: { externalScopeId: string; label?: string; include?: boolean; rules?: Record<string, unknown> }) {
    await this.enabled(org);
    const [connector] = await this.db.select().from(schema.searchConnectors).where(and(eq(schema.searchConnectors.organizationId, org), eq(schema.searchConnectors.id, connectorId))).limit(1);
    if (!connector) throw new AppError("NOT_FOUND", "Connector not found");
    const [row] = await this.db.insert(schema.connectorScopes).values({ organizationId: org, connectorId, externalScopeId: input.externalScopeId, label: input.label, include: input.include ?? true, rules: input.rules ?? {} }).returning();
    return row;
  }

  async crawl(org: string, connectorId: string, documents: ExternalDocument[], cursor?: string) {
    await this.enabled(org);
    const [connector] = await this.db.select().from(schema.searchConnectors).where(and(eq(schema.searchConnectors.organizationId, org), eq(schema.searchConnectors.id, connectorId), eq(schema.searchConnectors.status, "active"))).limit(1);
    if (!connector) throw new AppError("NOT_FOUND", "Active connector not found");
    const [run] = await this.db.insert(schema.crawlRuns).values({ organizationId: org, connectorId, cursor }).returning();
    let indexed = 0; let failed = 0; const errors: unknown[] = [];
    for (const doc of documents) {
      try {
        if (!doc.externalId || !doc.title) throw new Error("externalId and title are required");
        const contentHash = sha256(doc.content ?? `${doc.title}\n${doc.snippet ?? ""}`);
        const existing = await this.db.select().from(schema.indexedExternalObjects).where(and(eq(schema.indexedExternalObjects.connectorId, connectorId), eq(schema.indexedExternalObjects.externalId, doc.externalId))).limit(1).then((r) => r[0]);
        const expiresAt = new Date(Date.now() + connector.retentionDays * 86_400_000);
        const values = { organizationId: org, connectorId, externalId: doc.externalId, sourceType: doc.sourceType, title: doc.title, snippet: doc.snippet ?? doc.content?.slice(0, 800), deepLink: doc.deepLink, contentHash, metadata: doc.metadata ?? {}, stale: false, sourceUpdatedAt: doc.sourceUpdatedAt ? new Date(doc.sourceUpdatedAt) : null, indexedAt: new Date(), expiresAt };
        let externalObjectId: string;
        if (existing) { await this.db.update(schema.indexedExternalObjects).set(values).where(eq(schema.indexedExternalObjects.id, existing.id)); externalObjectId = existing.id; }
        else { const [created] = await this.db.insert(schema.indexedExternalObjects).values(values).returning(); externalObjectId = created.id; }
        const acl = await this.db.select().from(schema.externalAclSnapshots).where(eq(schema.externalAclSnapshots.externalObjectId, externalObjectId)).limit(1).then((r) => r[0]);
        if (acl) await this.db.update(schema.externalAclSnapshots).set({ principals: doc.principals ?? [], sourceVersion: doc.sourceVersion, capturedAt: new Date() }).where(eq(schema.externalAclSnapshots.id, acl.id));
        else await this.db.insert(schema.externalAclSnapshots).values({ organizationId: org, externalObjectId, principals: doc.principals ?? [], sourceVersion: doc.sourceVersion });
        indexed++;
      } catch (error) { failed++; if (errors.length < 100) errors.push({ externalId: doc.externalId, message: error instanceof Error ? error.message : "Failed" }); }
    }
    await this.db.update(schema.crawlRuns).set({ status: failed ? "completed_with_errors" : "completed", indexed, failed, errors, finishedAt: new Date() }).where(eq(schema.crawlRuns.id, run.id));
    return { runId: run.id, indexed, failed, errors };
  }

  private async principals(org: string, userId: string) {
    const memberships = await this.db.select({ teamId: schema.teamMembers.teamId }).from(schema.teamMembers).where(and(eq(schema.teamMembers.organizationId, org), eq(schema.teamMembers.userId, userId), isNull(schema.teamMembers.deletedAt)));
    return new Set(["everyone", `user:${userId}`, ...memberships.map((m) => `team:${m.teamId}`)]);
  }

  private async canOpen(org: string, userId: string, externalObjectId: string) {
    const [obj] = await this.db.select().from(schema.indexedExternalObjects).where(and(eq(schema.indexedExternalObjects.organizationId, org), eq(schema.indexedExternalObjects.id, externalObjectId), eq(schema.indexedExternalObjects.stale, false), or(isNull(schema.indexedExternalObjects.expiresAt), gt(schema.indexedExternalObjects.expiresAt, new Date())))).limit(1);
    if (!obj) return false;
    const [acl] = await this.db.select().from(schema.externalAclSnapshots).where(and(eq(schema.externalAclSnapshots.organizationId, org), eq(schema.externalAclSnapshots.externalObjectId, externalObjectId))).limit(1);
    if (!acl) return false;
    const viewer = await this.principals(org, userId);
    return (acl.principals as string[]).some((p) => viewer.has(p));
  }

  async search(org: string, userId: string, query: string, sourceType?: string) {
    await this.enabled(org);
    const rows = await this.db.select().from(schema.indexedExternalObjects).where(and(eq(schema.indexedExternalObjects.organizationId, org), eq(schema.indexedExternalObjects.stale, false), or(ilike(schema.indexedExternalObjects.title, `%${query}%`), ilike(schema.indexedExternalObjects.snippet, `%${query}%`)), sourceType ? eq(schema.indexedExternalObjects.sourceType, sourceType) : undefined, or(isNull(schema.indexedExternalObjects.expiresAt), gt(schema.indexedExternalObjects.expiresAt, new Date())))).limit(200);
    const results = [];
    for (const row of rows) if (await this.canOpen(org, userId, row.id)) results.push({ id: row.id, sourceType: row.sourceType, title: row.title, snippet: row.snippet, deepLink: row.deepLink, indexedAt: row.indexedAt, freshness: row.sourceUpdatedAt });
    return { query, total: results.length, results };
  }

  async detail(org: string, userId: string, id: string) {
    await this.enabled(org);
    if (!(await this.canOpen(org, userId, id))) throw new AppError("FORBIDDEN", "External result is no longer accessible");
    const [row] = await this.db.select().from(schema.indexedExternalObjects).where(and(eq(schema.indexedExternalObjects.organizationId, org), eq(schema.indexedExternalObjects.id, id))).limit(1);
    return row;
  }

  async cite(org: string, userId: string, query: string, externalObjectId: string, purpose = "search") {
    await this.enabled(org);
    if (!(await this.canOpen(org, userId, externalObjectId))) throw new AppError("FORBIDDEN", "Source ACL no longer permits access");
    const [row] = await this.db.insert(schema.retrievalCitations).values({ organizationId: org, userId, query, externalObjectId, purpose }).returning();
    return row;
  }

  async invalidateConnector(org: string, connectorId: string) {
    await this.enabled(org);
    await this.db.update(schema.indexedExternalObjects).set({ stale: true }).where(and(eq(schema.indexedExternalObjects.organizationId, org), eq(schema.indexedExternalObjects.connectorId, connectorId)));
    await this.db.update(schema.searchConnectors).set({ status: "disconnected" }).where(and(eq(schema.searchConnectors.organizationId, org), eq(schema.searchConnectors.id, connectorId)));
    return { connectorId, invalidated: true };
  }
}
