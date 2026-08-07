import { Injectable, Inject } from "@nestjs/common";
import { and, eq } from "drizzle-orm";
import { createHmac } from "node:crypto";
import { schema, type Database } from "@pm/db";
import { AppError, type Env } from "@pm/shared";
import { DB } from "../db/db.module.js";
import { ENV } from "../config/config.module.js";
import { ModulesService, OPTIONAL_MODULES } from "../modules/modules.service.js";
import { seedOrgDefaults } from "../seed/defaults.js";
import { ConfigService, type ConfigDoc } from "../config-export/config.service.js";
import { sha256 } from "../common/crypto.js";

function byKey(doc: ConfigDoc) {
  return {
    fields: new Map(doc.fields.map((v: any) => [v.key, v])),
    types: new Map(doc.types.map((v: any) => [v.key, v])),
    roles: new Map(doc.roles.map((v: any) => [v.key, v])),
  };
}

@Injectable()
export class SandboxService {
  private readonly signingKey: string;
  constructor(@Inject(DB) private readonly db: Database, @Inject(ENV) env: Env, private readonly modules: ModulesService, private readonly config: ConfigService) { this.signingKey = env.SESSION_SECRET; }
  private enabled(org: string) { return this.modules.assertEnabled(org, "sandbox"); }
  private sign(checksum: string) { return createHmac("sha256", this.signingKey).update(checksum).digest("hex"); }

  async list(org: string) {
    await this.enabled(org);
    const [environments, packages, promotions] = await Promise.all([
      this.db.select().from(schema.sandboxEnvironments).where(eq(schema.sandboxEnvironments.organizationId, org)),
      this.db.select().from(schema.configurationPackages).where(eq(schema.configurationPackages.organizationId, org)),
      this.db.select().from(schema.promotionRuns).where(eq(schema.promotionRuns.organizationId, org)).limit(100),
    ]);
    return { environments, packages, promotions };
  }

  async createEnvironment(org: string, userId: string, input: { name: string; mode?: "configuration_only" | "masked_sample"; label?: string }) {
    await this.enabled(org);
    const [source] = await this.db.select().from(schema.organizations).where(eq(schema.organizations.id, org)).limit(1);
    if (!source) throw new AppError("NOT_FOUND", "Organization not found");
    const suffix = Math.random().toString(36).slice(2, 8);
    const sandboxSlug = `${source.slug}-sandbox-${suffix}`.slice(0, 60);
    const [settings] = await this.db.select().from(schema.organizationSettings).where(eq(schema.organizationSettings.organizationId, org)).limit(1);
    const sourceConfig = await this.config.export(org);
    const sourceModules = await this.modules.list(org);
    const created = await this.db.transaction(async (tx) => {
      const [sandboxOrg] = await tx.insert(schema.organizations).values({ slug: sandboxSlug, name: `${source.name} - ${input.name}`, status: "active", createdBy: userId }).returning();
      await tx.insert(schema.organizationMemberships).values({ organizationId: sandboxOrg.id, userId, status: "active", createdBy: userId });
      await tx.insert(schema.organizationSettings).values({ organizationId: sandboxOrg.id, timezone: settings?.timezone ?? "UTC", weekStart: settings?.weekStart ?? 1, dateFormat: settings?.dateFormat ?? "YYYY-MM-DD", branding: { ...((settings?.branding as object | null) ?? {}), environmentLabel: input.label ?? "SANDBOX", outboundEmailSuppressed: true, externalIntegrationsRestricted: true }, createdBy: userId });
      await seedOrgDefaults(tx as unknown as Database, sandboxOrg.id, userId);
      await tx.insert(schema.userRoleAssignments).values({ organizationId: sandboxOrg.id, userId, roleKey: "organization_admin", scopeType: "organization" }).onConflictDoNothing();
      const [environment] = await tx.insert(schema.sandboxEnvironments).values({ organizationId: org, sandboxOrganizationId: sandboxOrg.id, name: input.name, mode: input.mode ?? "configuration_only", label: input.label ?? "SANDBOX", maskedSampleData: input.mode === "masked_sample", createdByUserId: userId }).returning();
      return { sandboxOrg, environment };
    });
    await this.config.import(created.sandboxOrg.id, userId, sourceConfig);
    const outboundModules = new Set(["communications", "devops", "connected_search"]);
    for (const moduleName of OPTIONAL_MODULES) {
      const enabled = moduleName === "sandbox" || (Boolean(sourceModules[moduleName]) && !outboundModules.has(moduleName));
      await this.modules.setEnabled(created.sandboxOrg.id, moduleName, enabled, userId);
    }
    return { environment: created.environment, sandboxOrganization: { id: created.sandboxOrg.id, slug: created.sandboxOrg.slug, name: created.sandboxOrg.name }, safeguards: { integrationsRestricted: true, emailSuppressed: true, secretsCopied: false, outboundModulesDisabled: [...outboundModules] } };
  }

  async buildPackage(org: string, userId: string, input: { sandboxId?: string; name: string; description?: string; sourceOrganizationId?: string }) {
    await this.enabled(org);
    let sourceOrg = input.sourceOrganizationId ?? org;
    if (input.sandboxId) {
      const [env] = await this.db.select().from(schema.sandboxEnvironments).where(and(eq(schema.sandboxEnvironments.organizationId, org), eq(schema.sandboxEnvironments.id, input.sandboxId))).limit(1);
      if (!env) throw new AppError("NOT_FOUND", "Sandbox not found");
      sourceOrg = env.sandboxOrganizationId;
    }
    const payload = await this.config.export(sourceOrg);
    const checksum = sha256(JSON.stringify(payload));
    return this.db.transaction(async (tx) => {
      const [pkg] = await tx.insert(schema.configurationPackages).values({ organizationId: org, sandboxId: input.sandboxId, name: input.name, description: input.description, status: "published", createdByUserId: userId }).returning();
      const [version] = await tx.insert(schema.packageVersions).values({ organizationId: org, packageId: pkg.id, version: 1, manifest: { schemaVersion: 1, sourceOrganizationId: sourceOrg, counts: { fields: payload.fields.length, types: payload.types.length, roles: payload.roles.length }, secretMaterial: false }, payload, checksum, signature: this.sign(checksum), createdByUserId: userId }).returning();
      return { package: pkg, version };
    });
  }

  private async version(org: string, id: string) {
    const [row] = await this.db.select().from(schema.packageVersions).where(and(eq(schema.packageVersions.organizationId, org), eq(schema.packageVersions.id, id))).limit(1);
    if (!row) throw new AppError("NOT_FOUND", "Package version not found");
    if (row.signature !== this.sign(row.checksum) || row.checksum !== sha256(JSON.stringify(row.payload))) throw new AppError("CONFLICT", "Package signature or checksum is invalid");
    return row;
  }

  async diff(org: string, versionId: string, targetOrganizationId = org) {
    await this.enabled(org);
    const version = await this.version(org, versionId);
    const source = version.payload as ConfigDoc; const target = await this.config.export(targetOrganizationId);
    const a = byKey(source), b = byKey(target);
    const additions: unknown[] = [], changes: unknown[] = [], removals: unknown[] = [], conflicts: unknown[] = [];
    for (const type of ["fields", "types", "roles"] as const) {
      const sourceMap = a[type], targetMap = b[type];
      for (const [key, value] of sourceMap) {
        const current = targetMap.get(key);
        if (!current) additions.push({ type, key, value });
        else if (JSON.stringify(current) !== JSON.stringify(value)) {
          changes.push({ type, key, before: current, after: value });
          if (type === "fields" && (current as any).fieldType !== (value as any).fieldType) conflicts.push({ type, key, code: "FIELD_TYPE_CHANGE_REQUIRES_MIGRATION" });
        }
      }
      for (const [key, value] of targetMap) if (!sourceMap.has(key)) removals.push({ type, key, value, action: "retain_by_default" });
    }
    const dependencies = source.fieldOptions.map((o: any) => ({ type: "field_option", fieldKey: o.fieldKey }));
    const impact = { additions: additions.length, changes: changes.length, retainedTargetOnly: removals.length, conflicts: conflicts.length, highRisk: changes.filter((c: any) => c.type === "roles").length };
    const [row] = await this.db.insert(schema.environmentDiffs).values({ organizationId: org, packageVersionId: versionId, targetOrganizationId, additions, changes, removals, conflicts, dependencies, impact }).returning();
    return row;
  }

  async requestPromotion(org: string, userId: string, input: { packageVersionId: string; targetOrganizationId?: string; scheduledFor?: string }) {
    await this.enabled(org); await this.version(org, input.packageVersionId);
    const target = input.targetOrganizationId ?? org;
    const diff = await this.diff(org, input.packageVersionId, target);
    const [row] = await this.db.insert(schema.promotionRuns).values({ organizationId: org, packageVersionId: input.packageVersionId, targetOrganizationId: target, scheduledFor: input.scheduledFor ? new Date(input.scheduledFor) : null, requestedByUserId: userId, evidence: { diffId: diff.id, conflicts: diff.conflicts, impact: diff.impact } }).returning();
    return row;
  }

  async approveAndPromote(org: string, userId: string, runId: string) {
    await this.enabled(org);
    const [run] = await this.db.select().from(schema.promotionRuns).where(and(eq(schema.promotionRuns.organizationId, org), eq(schema.promotionRuns.id, runId))).limit(1);
    if (!run) throw new AppError("NOT_FOUND", "Promotion run not found");
    if (run.requestedByUserId === userId) throw new AppError("FORBIDDEN", "High-risk promotion requires an independent approver");
    const version = await this.version(org, run.packageVersionId);
    const evidence = run.evidence as { conflicts?: unknown[] };
    if ((evidence.conflicts ?? []).length) throw new AppError("CONFLICT", "Resolve package conflicts before promotion", evidence.conflicts);
    const before = await this.config.export(run.targetOrganizationId);
    await this.db.update(schema.promotionRuns).set({ status: "running", approvedByUserId: userId, startedAt: new Date() }).where(eq(schema.promotionRuns.id, runId));
    try {
      const result = await this.config.import(run.targetOrganizationId, userId, version.payload as ConfigDoc);
      const checksum = sha256(JSON.stringify(before));
      await this.db.insert(schema.rollbackPackages).values({ organizationId: org, promotionRunId: runId, payload: before, checksum });
      await this.db.update(schema.promotionRuns).set({ status: "completed", result, finishedAt: new Date() }).where(eq(schema.promotionRuns.id, runId));
      return { runId, status: "completed", result };
    } catch (error) {
      await this.db.update(schema.promotionRuns).set({ status: "failed", result: { error: error instanceof Error ? error.message : "Promotion failed" }, finishedAt: new Date() }).where(eq(schema.promotionRuns.id, runId));
      throw error;
    }
  }

  async rollback(org: string, userId: string, runId: string) {
    await this.enabled(org);
    const [run] = await this.db.select().from(schema.promotionRuns).where(and(eq(schema.promotionRuns.organizationId, org), eq(schema.promotionRuns.id, runId))).limit(1);
    const [rollback] = await this.db.select().from(schema.rollbackPackages).where(eq(schema.rollbackPackages.promotionRunId, runId)).limit(1);
    if (!run || !rollback) throw new AppError("NOT_FOUND", "Rollback package not found");
    if (sha256(JSON.stringify(rollback.payload)) !== rollback.checksum) throw new AppError("CONFLICT", "Rollback checksum failed");
    const result = await this.config.import(run.targetOrganizationId, userId, rollback.payload as ConfigDoc);
    await this.db.update(schema.rollbackPackages).set({ appliedAt: new Date() }).where(eq(schema.rollbackPackages.id, rollback.id));
    await this.db.update(schema.promotionRuns).set({ status: "rolled_back", result: { ...run.result as object, rollback: result }, finishedAt: new Date() }).where(eq(schema.promotionRuns.id, runId));
    return { runId, rolledBack: true, result };
  }
}
