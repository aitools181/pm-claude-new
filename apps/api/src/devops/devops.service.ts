import { Injectable, Inject } from "@nestjs/common";
import { and, eq, gte, inArray, isNull, lte, sql } from "drizzle-orm";
import { createHmac, timingSafeEqual } from "node:crypto";
import { schema, type Database } from "@pm/db";
import { AppError } from "@pm/shared";
import { DB } from "../db/db.module.js";
import { ModulesService } from "../modules/modules.service.js";
import { IntegrationService } from "../integrations/integration.service.js";
import { canAccessProject, canAccessWorkItem } from "../collab/access.js";
import { sha256 } from "../common/crypto.js";

type Event = { eventId: string; eventType: string; repositoryExternalId?: string; projectId?: string; externalId: string; title?: string; url?: string; status?: string; branch?: string; commitSha?: string; author?: string; reviewers?: unknown[]; startedAt?: string; finishedAt?: string; deployedAt?: string; environment?: string; version?: string; severity?: string; workItemKeys?: string[]; changeSet?: unknown[]; raw?: Record<string, unknown> };

@Injectable()
export class DevOpsService {
  constructor(@Inject(DB) private readonly db: Database, private readonly modules: ModulesService, private readonly integrations: IntegrationService) {}
  private enabled(org: string) { return this.modules.assertEnabled(org, "devops"); }

  async list(org: string, userId: string) {
    await this.enabled(org);
    const repositories = await this.db.select().from(schema.devopsRepositories).where(eq(schema.devopsRepositories.organizationId, org));
    const visible = [];
    for (const r of repositories) if (!r.projectId || await canAccessProject(this.db, org, r.projectId, userId)) visible.push(r);
    const [environments, metrics] = await Promise.all([
      this.db.select().from(schema.devopsEnvironments).where(eq(schema.devopsEnvironments.organizationId, org)),
      this.db.select().from(schema.devMetricSnapshots).where(eq(schema.devMetricSnapshots.organizationId, org)).limit(100),
    ]);
    return { repositories: visible, environments, metrics };
  }

  async createRepository(org: string, userId: string, input: { provider: "github" | "gitlab" | "bitbucket" | "generic"; integrationId?: string; projectId?: string; externalId: string; name: string; url?: string; isPrivate?: boolean }) {
    await this.enabled(org);
    if (input.projectId && !(await canAccessProject(this.db, org, input.projectId, userId))) throw new AppError("FORBIDDEN", "No access to project");
    const [row] = await this.db.insert(schema.devopsRepositories).values({ organizationId: org, provider: input.provider, integrationId: input.integrationId, projectId: input.projectId, externalId: input.externalId, name: input.name, url: input.url, isPrivate: input.isPrivate ?? true }).returning();
    return row;
  }

  async createEnvironment(org: string, userId: string, input: { projectId?: string; name: string; environmentType?: string; protected?: boolean }) {
    await this.enabled(org);
    if (input.projectId && !(await canAccessProject(this.db, org, input.projectId, userId))) throw new AppError("FORBIDDEN", "No access to project");
    const [row] = await this.db.insert(schema.devopsEnvironments).values({ organizationId: org, projectId: input.projectId, name: input.name, environmentType: input.environmentType ?? "production", protected: input.protected ?? false }).returning();
    return row;
  }

  private verify(secret: string, payload: string, signature: string) {
    const normalized = signature.replace(/^sha256=/, "");
    const expected = createHmac("sha256", secret).update(payload).digest("hex");
    const a = Buffer.from(expected, "hex"), b = Buffer.from(normalized, "hex");
    return a.length === b.length && timingSafeEqual(a, b);
  }

  async ingestFromHook(integrationId: string, signature: string, payload: string) {
    const context = await this.integrations.getServerContext(integrationId);
    let decoded: { provider?: string; event?: Event };
    try { decoded = JSON.parse(payload) as { provider?: string; event?: Event }; }
    catch { throw new AppError("VALIDATION", "Webhook payload must be valid JSON"); }
    if (!decoded.event?.eventId || !decoded.event?.eventType || !decoded.event?.externalId) throw new AppError("VALIDATION", "Webhook eventId, eventType and externalId are required");
    return this.ingest(context.organizationId, { provider: decoded.provider ?? context.kind, integrationId, signature, payload, event: decoded.event });
  }

  async ingest(org: string, input: { provider: string; integrationId?: string; signature?: string; payload: string; event: Event }) {
    await this.enabled(org);
    if (input.integrationId) {
      const secret = await this.integrations.getServerSecret(org, input.integrationId);
      if (!secret || !input.signature || !this.verify(secret, input.payload, input.signature)) throw new AppError("FORBIDDEN", "Invalid webhook signature");
    } else throw new AppError("VALIDATION", "Signed integration is required");
    const payloadHash = sha256(input.payload);
    const existing = await this.db.select().from(schema.devopsWebhookEvents).where(and(eq(schema.devopsWebhookEvents.organizationId, org), eq(schema.devopsWebhookEvents.provider, input.provider), eq(schema.devopsWebhookEvents.eventId, input.event.eventId))).limit(1).then((r) => r[0]);
    if (existing) return { replay: true, eventId: existing.id };
    const [repository] = input.event.repositoryExternalId ? await this.db.select().from(schema.devopsRepositories).where(and(eq(schema.devopsRepositories.organizationId, org), eq(schema.devopsRepositories.provider, input.provider), eq(schema.devopsRepositories.externalId, input.event.repositoryExternalId))).limit(1) : [undefined];
    const event = input.event;
    await this.db.transaction(async (tx) => {
      await tx.insert(schema.devopsWebhookEvents).values({ organizationId: org, integrationId: input.integrationId, provider: input.provider, eventId: event.eventId, eventType: event.eventType, payloadHash });
      if (/pull_request|merge_request/i.test(event.eventType) && repository) {
        const existingPr = await tx.select().from(schema.pullRequests).where(and(eq(schema.pullRequests.repositoryId, repository.id), eq(schema.pullRequests.externalId, event.externalId))).limit(1).then((r) => r[0]);
        const values = { organizationId: org, repositoryId: repository.id, externalId: event.externalId, title: event.title ?? event.externalId, url: event.url, author: event.author, status: event.status ?? "open", reviewers: event.reviewers ?? [], openedAt: event.startedAt ? new Date(event.startedAt) : new Date(), mergedAt: /merged/i.test(event.status ?? "") ? new Date(event.finishedAt ?? Date.now()) : null, raw: event.raw ?? {} };
        if (existingPr) await tx.update(schema.pullRequests).set(values).where(eq(schema.pullRequests.id, existingPr.id)); else await tx.insert(schema.pullRequests).values(values);
      } else if (/build|pipeline|check/i.test(event.eventType)) {
        const existingBuild = await tx.select().from(schema.devopsBuilds).where(and(eq(schema.devopsBuilds.organizationId, org), eq(schema.devopsBuilds.externalId, event.externalId))).limit(1).then((r) => r[0]);
        const values = { organizationId: org, repositoryId: repository?.id, externalId: event.externalId, status: event.status ?? "unknown", branch: event.branch, commitSha: event.commitSha, startedAt: event.startedAt ? new Date(event.startedAt) : null, finishedAt: event.finishedAt ? new Date(event.finishedAt) : null, raw: event.raw ?? {} };
        if (existingBuild) await tx.update(schema.devopsBuilds).set(values).where(eq(schema.devopsBuilds.id, existingBuild.id)); else await tx.insert(schema.devopsBuilds).values(values);
      } else if (/deploy/i.test(event.eventType)) {
        let environmentId: string | undefined;
        if (event.environment) {
          const env = await tx.select().from(schema.devopsEnvironments).where(and(eq(schema.devopsEnvironments.organizationId, org), eq(schema.devopsEnvironments.name, event.environment), event.projectId ? eq(schema.devopsEnvironments.projectId, event.projectId) : undefined)).limit(1).then((r) => r[0]);
          environmentId = env?.id;
        }
        const existingDeployment = await tx.select().from(schema.deployments).where(and(eq(schema.deployments.organizationId, org), eq(schema.deployments.externalId, event.externalId))).limit(1).then((r) => r[0]);
        const values = { organizationId: org, repositoryId: repository?.id, environmentId, externalId: event.externalId, version: event.version, status: event.status ?? "unknown", commitSha: event.commitSha, changeSet: event.changeSet ?? [], deployedAt: event.deployedAt ? new Date(event.deployedAt) : new Date(), raw: event.raw ?? {} };
        if (existingDeployment) await tx.update(schema.deployments).set(values).where(eq(schema.deployments.id, existingDeployment.id)); else await tx.insert(schema.deployments).values(values);
      } else if (/security|finding|vulnerability/i.test(event.eventType)) {
        const existingFinding = await tx.select().from(schema.securityFindings).where(and(eq(schema.securityFindings.organizationId, org), eq(schema.securityFindings.externalId, event.externalId))).limit(1).then((r) => r[0]);
        const values = { organizationId: org, repositoryId: repository?.id, externalId: event.externalId, severity: event.severity ?? "unknown", title: event.title ?? event.externalId, status: event.status ?? "open", url: event.url, discoveredAt: event.startedAt ? new Date(event.startedAt) : new Date(), raw: event.raw ?? {} };
        if (existingFinding) await tx.update(schema.securityFindings).set(values).where(eq(schema.securityFindings.id, existingFinding.id)); else await tx.insert(schema.securityFindings).values(values);
      }
    });
    const keys = new Set([...(event.workItemKeys ?? []), ...((event.title ?? "").match(/[A-Z][A-Z0-9]+-\d+/g) ?? []), ...((event.branch ?? "").match(/[A-Z][A-Z0-9]+-\d+/g) ?? [])]);
    let links = 0;
    for (const key of keys) {
      const [item] = await this.db.select().from(schema.workItems).where(and(eq(schema.workItems.organizationId, org), eq(schema.workItems.key, key), isNull(schema.workItems.deletedAt))).limit(1);
      if (!item) continue;
      await this.db.insert(schema.developmentLinks).values({ organizationId: org, workItemId: item.id, repositoryId: repository?.id, kind: event.eventType, externalId: event.externalId, url: event.url, title: event.title, status: event.status, metadata: event.raw ?? {}, occurredAt: new Date(event.deployedAt ?? event.finishedAt ?? event.startedAt ?? Date.now()) }).onConflictDoNothing();
      links++;
    }
    return { replay: false, links, event: event.eventType };
  }

  async itemPanel(org: string, userId: string, workItemId: string) {
    await this.enabled(org);
    if (!(await canAccessWorkItem(this.db, org, workItemId, userId))) throw new AppError("FORBIDDEN", "No access to work item");
    return this.db.select().from(schema.developmentLinks).where(and(eq(schema.developmentLinks.organizationId, org), eq(schema.developmentLinks.workItemId, workItemId)));
  }

  async readiness(org: string, userId: string, projectId: string) {
    await this.enabled(org);
    if (!(await canAccessProject(this.db, org, projectId, userId))) throw new AppError("FORBIDDEN", "No access");
    const repos = await this.db.select({ id: schema.devopsRepositories.id }).from(schema.devopsRepositories).where(and(eq(schema.devopsRepositories.organizationId, org), eq(schema.devopsRepositories.projectId, projectId)));
    const repoIds = repos.map((r) => r.id);
    const [openPrs, failedBuilds, openFindings, recentDeployments, blockers] = await Promise.all([
      repoIds.length ? this.db.select().from(schema.pullRequests).where(and(inArray(schema.pullRequests.repositoryId, repoIds), eq(schema.pullRequests.status, "open"))) : [],
      repoIds.length ? this.db.select().from(schema.devopsBuilds).where(and(inArray(schema.devopsBuilds.repositoryId, repoIds), eq(schema.devopsBuilds.status, "failed"))) : [],
      repoIds.length ? this.db.select().from(schema.securityFindings).where(and(inArray(schema.securityFindings.repositoryId, repoIds), eq(schema.securityFindings.status, "open"))) : [],
      this.db.select().from(schema.deployments).where(and(eq(schema.deployments.organizationId, org), repoIds.length ? inArray(schema.deployments.repositoryId, repoIds) : undefined)).limit(20),
      this.db.select().from(schema.workItems).where(and(eq(schema.workItems.organizationId, org), eq(schema.workItems.owningProjectId, projectId), eq(schema.workItems.priority, "urgent"), isNull(schema.workItems.deletedAt), sql`${schema.workItems.statusCategory} <> 'done'`)),
    ]);
    return { ready: failedBuilds.length === 0 && openFindings.filter((f) => ["critical", "high"].includes(f.severity)).length === 0 && blockers.length === 0, openPullRequests: openPrs.length, failedBuilds: failedBuilds.length, openSecurityFindings: openFindings.length, unresolvedBlockers: blockers.length, recentDeployments };
  }

  async calculateDora(org: string, userId: string, input: { projectId?: string; periodStart: string; periodEnd: string }) {
    await this.enabled(org);
    if (input.projectId && !(await canAccessProject(this.db, org, input.projectId, userId))) throw new AppError("FORBIDDEN", "No access");
    const start = new Date(input.periodStart), end = new Date(input.periodEnd);
    const repos = input.projectId ? await this.db.select({ id: schema.devopsRepositories.id }).from(schema.devopsRepositories).where(and(eq(schema.devopsRepositories.organizationId, org), eq(schema.devopsRepositories.projectId, input.projectId))) : [];
    const repoIds = repos.map((r) => r.id);
    const deployments = await this.db.select().from(schema.deployments).where(and(eq(schema.deployments.organizationId, org), gte(schema.deployments.deployedAt, start), lte(schema.deployments.deployedAt, end), repoIds.length ? inArray(schema.deployments.repositoryId, repoIds) : undefined));
    const failed = deployments.filter((d) => /fail|rollback/i.test(d.status));
    const periodDays = Math.max(1, (end.getTime() - start.getTime()) / 86_400_000);
    const deploymentFrequency = deployments.length / periodDays;
    const changeFailureRate = deployments.length ? failed.length / deployments.length : 0;
    const [snapshot] = await this.db.insert(schema.devMetricSnapshots).values({ organizationId: org, projectId: input.projectId, periodStart: start, periodEnd: end, deploymentFrequency, changeFailureRate, leadTimeHours: null, restoreTimeHours: null, reviewTimeHours: null, source: { deployments: deployments.length, failures: failed.length } }).returning();
    return snapshot;
  }
}
