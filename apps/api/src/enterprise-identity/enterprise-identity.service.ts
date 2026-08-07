import { Injectable, Inject } from "@nestjs/common";
import { timingSafeEqual } from "node:crypto";
import { and, eq, gt, inArray, isNull } from "drizzle-orm";
import { schema, type Database } from "@pm/db";
import { AppError } from "@pm/shared";
import { DB } from "../db/db.module.js";
import { ModulesService } from "../modules/modules.service.js";
import { issueToken, sha256 } from "../common/crypto.js";
import { probeIdentityProvider } from "./identity-adapters.js";

export type DirectoryEntry = {
  externalSubject: string;
  email: string;
  displayName: string;
  active?: boolean;
  groups?: string[];
  attributes?: Record<string, unknown>;
};

@Injectable()
export class EnterpriseIdentityService {
  constructor(@Inject(DB) private readonly db: Database, private readonly modules: ModulesService) {}
  private enabled(org: string) { return this.modules.assertEnabled(org, "enterprise_identity"); }

  async list(org: string) {
    await this.enabled(org);
    const [providers, domains, connectors, mappings, exemptions] = await Promise.all([
      this.db.select().from(schema.identityProviders).where(and(eq(schema.identityProviders.organizationId, org), isNull(schema.identityProviders.deletedAt))),
      this.db.select().from(schema.verifiedDomains).where(eq(schema.verifiedDomains.organizationId, org)),
      this.db.select().from(schema.directoryConnectors).where(and(eq(schema.directoryConnectors.organizationId, org), isNull(schema.directoryConnectors.deletedAt))),
      this.db.select().from(schema.provisioningMappings).where(eq(schema.provisioningMappings.organizationId, org)),
      this.db.select().from(schema.ssoExemptions).where(eq(schema.ssoExemptions.organizationId, org)),
    ]);
    return { providers, domains: domains.map(({ verificationTokenHash: _secret, ...d }) => d), connectors, mappings, exemptions };
  }

  async createProvider(org: string, userId: string, input: { kind: "saml" | "oidc"; name: string; issuerUrl?: string; metadataUrl?: string; clientId?: string; config?: Record<string, unknown> }) {
    await this.enabled(org);
    const [row] = await this.db.insert(schema.identityProviders).values({ organizationId: org, kind: input.kind, name: input.name, issuerUrl: input.issuerUrl, metadataUrl: input.metadataUrl, clientId: input.clientId, config: input.config ?? {}, createdBy: userId, updatedBy: userId }).returning();
    return row;
  }

  async probeProvider(org: string, providerId: string) {
    await this.enabled(org);
    const [provider] = await this.db.select().from(schema.identityProviders).where(and(eq(schema.identityProviders.id, providerId), eq(schema.identityProviders.organizationId, org))).limit(1);
    if (!provider) throw new AppError("NOT_FOUND", "Identity provider not found");
    const result = await probeIdentityProvider({ kind: provider.kind as "saml" | "oidc", issuerUrl: provider.issuerUrl ?? undefined, metadataUrl: provider.metadataUrl ?? undefined });
    await this.db.update(schema.identityProviders).set({ lastHealthAt: new Date(), lastHealthStatus: result.ok ? "ok" : "failing", status: result.ok ? (provider.testMode ? "test" : "active") : "error", updatedAt: new Date() }).where(eq(schema.identityProviders.id, provider.id));
    return result;
  }

  async enforce(org: string, providerId: string, mode: "optional" | "approved_domains" | "enforced", testMode: boolean) {
    await this.enabled(org);
    const [row] = await this.db.update(schema.identityProviders).set({ enforcementMode: mode, testMode, status: testMode ? "test" : "active", updatedAt: new Date() }).where(and(eq(schema.identityProviders.id, providerId), eq(schema.identityProviders.organizationId, org))).returning();
    if (!row) throw new AppError("NOT_FOUND", "Identity provider not found");
    return row;
  }

  async createDomain(org: string, userId: string, domain: string, providerId?: string) {
    await this.enabled(org);
    const normalized = domain.trim().toLowerCase().replace(/^@/, "");
    if (!/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(normalized)) throw new AppError("VALIDATION", "Invalid domain");
    const token = issueToken(18);
    const [row] = await this.db.insert(schema.verifiedDomains).values({ organizationId: org, providerId, domain: normalized, verificationTokenHash: token.hash, claimedByUserId: userId }).returning();
    return { domain: row, verificationToken: token.raw, dnsRecord: `_pm-platform-verification.${normalized}` };
  }

  async verifyDomain(org: string, domainId: string, token: string) {
    await this.enabled(org);
    const [row] = await this.db.select().from(schema.verifiedDomains).where(and(eq(schema.verifiedDomains.id, domainId), eq(schema.verifiedDomains.organizationId, org))).limit(1);
    if (!row || sha256(token) !== row.verificationTokenHash) throw new AppError("FORBIDDEN", "Domain verification token is invalid");
    const [updated] = await this.db.update(schema.verifiedDomains).set({ verifiedAt: new Date() }).where(eq(schema.verifiedDomains.id, domainId)).returning();
    return updated;
  }

  async createConnector(org: string, userId: string, input: { kind: "ldap" | "active_directory" | "scim"; name: string; config?: Record<string, unknown>; credentialRef?: string; scheduleCron?: string }) {
    await this.enabled(org);
    const [row] = await this.db.insert(schema.directoryConnectors).values({ organizationId: org, ...input, config: input.config ?? {}, createdBy: userId, updatedBy: userId }).returning();
    return row;
  }

  async addMapping(org: string, userId: string, input: { connectorId: string; externalGroup: string; targetRoleKey?: string; targetTeamId?: string; highRisk?: boolean }) {
    await this.enabled(org);
    const [connector] = await this.db.select({ id: schema.directoryConnectors.id }).from(schema.directoryConnectors).where(and(eq(schema.directoryConnectors.id, input.connectorId), eq(schema.directoryConnectors.organizationId, org))).limit(1);
    if (!connector) throw new AppError("NOT_FOUND", "Directory connector not found");
    const highRisk = input.highRisk ?? /admin|owner|security/i.test(input.targetRoleKey ?? "");
    const [row] = await this.db.insert(schema.provisioningMappings).values({ organizationId: org, connectorId: input.connectorId, externalGroup: input.externalGroup, targetRoleKey: input.targetRoleKey, targetTeamId: input.targetTeamId, highRisk, approvedByUserId: highRisk ? null : userId, approvedAt: highRisk ? null : new Date() }).returning();
    return row;
  }

  async approveMapping(org: string, userId: string, mappingId: string) {
    await this.enabled(org);
    const [row] = await this.db.update(schema.provisioningMappings).set({ approvedByUserId: userId, approvedAt: new Date() }).where(and(eq(schema.provisioningMappings.id, mappingId), eq(schema.provisioningMappings.organizationId, org))).returning();
    if (!row) throw new AppError("NOT_FOUND", "Mapping not found");
    return row;
  }

  async sync(org: string, userId: string, connectorId: string, mode: "preview" | "apply", entries: DirectoryEntry[]) {
    await this.enabled(org);
    const [connector] = await this.db.select().from(schema.directoryConnectors).where(and(eq(schema.directoryConnectors.id, connectorId), eq(schema.directoryConnectors.organizationId, org))).limit(1);
    if (!connector) throw new AppError("NOT_FOUND", "Directory connector not found");
    const mappings = await this.db.select().from(schema.provisioningMappings).where(eq(schema.provisioningMappings.connectorId, connectorId));
    const existing = await this.db.select().from(schema.externalIdentities).where(and(eq(schema.externalIdentities.organizationId, org), eq(schema.externalIdentities.connectorId, connectorId)));
    const existingBySubject = new Map(existing.map((e) => [e.externalSubject, e]));
    const actions: Array<{ kind: string; subject: string; email: string; groups: string[]; roleKeys: string[]; teamIds: string[] }> = [];
    const incomingSubjects = new Set(entries.map((e) => e.externalSubject));
    for (const entry of entries) {
      const current = existingBySubject.get(entry.externalSubject);
      const approved = mappings.filter((m) => (entry.groups ?? []).includes(m.externalGroup) && (!m.highRisk || m.approvedAt));
      actions.push({ kind: !current ? "create" : entry.active === false ? "deactivate" : "update", subject: entry.externalSubject, email: entry.email.toLowerCase(), groups: entry.groups ?? [], roleKeys: approved.map((m) => m.targetRoleKey).filter(Boolean) as string[], teamIds: approved.map((m) => m.targetTeamId).filter(Boolean) as string[] });
    }
    for (const current of existing) if (!incomingSubjects.has(current.externalSubject) && current.status === "active") actions.push({ kind: "deactivate", subject: current.externalSubject, email: current.email ?? "", groups: [], roleKeys: [], teamIds: [] });

    const [run] = await this.db.insert(schema.directorySyncRuns).values({ organizationId: org, connectorId, mode, startedByUserId: userId, summary: { proposed: actions.length } }).returning();
    if (mode === "preview") {
      await this.db.update(schema.directorySyncRuns).set({ status: "completed", summary: { proposed: actions.length, actions }, finishedAt: new Date() }).where(eq(schema.directorySyncRuns.id, run.id));
      return { runId: run.id, applied: false, actions };
    }

    const summary = { created: 0, updated: 0, deactivated: 0, roles: 0, teams: 0 };
    await this.db.transaction(async (tx) => {
      for (const entry of entries) {
        let current = existingBySubject.get(entry.externalSubject);
        let userIdForEntry = current?.userId ?? null;
        if (!userIdForEntry) {
          const [user] = await tx.select().from(schema.users).where(eq(schema.users.email, entry.email.toLowerCase())).limit(1);
          if (user) userIdForEntry = user.id;
          else {
            const [created] = await tx.insert(schema.users).values({ email: entry.email.toLowerCase(), displayName: entry.displayName, createdBy: userId }).returning();
            userIdForEntry = created.id;
          }
          await tx.insert(schema.organizationMemberships).values({ organizationId: org, userId: userIdForEntry, status: entry.active === false ? "inactive" : "active", createdBy: userId }).onConflictDoNothing();
          const [external] = await tx.insert(schema.externalIdentities).values({ organizationId: org, connectorId, externalSubject: entry.externalSubject, userId: userIdForEntry, email: entry.email.toLowerCase(), attributes: entry.attributes ?? {}, status: entry.active === false ? "inactive" : "active", lastSeenAt: new Date() }).returning();
          current = external; summary.created++;
        } else {
          await tx.update(schema.users).set({ email: entry.email.toLowerCase(), displayName: entry.displayName, isActive: entry.active !== false, updatedBy: userId }).where(eq(schema.users.id, userIdForEntry));
          await tx.update(schema.organizationMemberships).set({ status: entry.active === false ? "inactive" : "active", updatedBy: userId }).where(and(eq(schema.organizationMemberships.organizationId, org), eq(schema.organizationMemberships.userId, userIdForEntry)));
          await tx.update(schema.externalIdentities).set({ email: entry.email.toLowerCase(), attributes: entry.attributes ?? {}, status: entry.active === false ? "inactive" : "active", lastSeenAt: new Date(), updatedAt: new Date() }).where(eq(schema.externalIdentities.id, current!.id));
          summary.updated++;
        }
        if (entry.active === false && userIdForEntry) {
          await tx.update(schema.userSessions).set({ revokedAt: new Date() }).where(and(eq(schema.userSessions.userId, userIdForEntry), isNull(schema.userSessions.revokedAt)));
          summary.deactivated++;
        }
        const approved = mappings.filter((m) => (entry.groups ?? []).includes(m.externalGroup) && (!m.highRisk || m.approvedAt));
        for (const mapping of approved) {
          if (mapping.targetRoleKey && userIdForEntry) {
            await tx.insert(schema.userRoleAssignments).values({ organizationId: org, userId: userIdForEntry, roleKey: mapping.targetRoleKey, scopeType: "organization" }).onConflictDoNothing(); summary.roles++;
          }
          if (mapping.targetTeamId && userIdForEntry) {
            await tx.insert(schema.teamMembers).values({ organizationId: org, teamId: mapping.targetTeamId, userId: userIdForEntry }).onConflictDoNothing(); summary.teams++;
          }
        }
      }
      const stale = existing.filter((e) => !incomingSubjects.has(e.externalSubject) && e.status === "active");
      if (stale.length) {
        await tx.update(schema.externalIdentities).set({ status: "inactive", updatedAt: new Date() }).where(inArray(schema.externalIdentities.id, stale.map((e) => e.id)));
        const staleUsers = stale.map((e) => e.userId).filter(Boolean) as string[];
        if (staleUsers.length) {
          await tx.update(schema.organizationMemberships).set({ status: "inactive", updatedBy: userId }).where(and(eq(schema.organizationMemberships.organizationId, org), inArray(schema.organizationMemberships.userId, staleUsers)));
          await tx.update(schema.userSessions).set({ revokedAt: new Date() }).where(and(inArray(schema.userSessions.userId, staleUsers), isNull(schema.userSessions.revokedAt)));
          summary.deactivated += staleUsers.length;
        }
      }
    });
    await this.db.update(schema.directoryConnectors).set({ status: "active", lastSyncAt: new Date(), syncCursor: String(Date.now()), updatedAt: new Date() }).where(eq(schema.directoryConnectors.id, connectorId));
    await this.db.update(schema.directorySyncRuns).set({ status: "completed", summary, cursorAfter: String(Date.now()), finishedAt: new Date() }).where(eq(schema.directorySyncRuns.id, run.id));
    return { runId: run.id, applied: true, summary };
  }


  async discover(domainOrEmail: string) {
    const domain = domainOrEmail.trim().toLowerCase().split("@").pop() ?? "";
    const [match] = await this.db.select({
      organizationId: schema.verifiedDomains.organizationId,
      domain: schema.verifiedDomains.domain,
      verifiedAt: schema.verifiedDomains.verifiedAt,
      providerId: schema.identityProviders.id,
      kind: schema.identityProviders.kind,
      name: schema.identityProviders.name,
      issuerUrl: schema.identityProviders.issuerUrl,
      clientId: schema.identityProviders.clientId,
      config: schema.identityProviders.config,
      enforcementMode: schema.identityProviders.enforcementMode,
      testMode: schema.identityProviders.testMode,
      status: schema.identityProviders.status,
      organizationSlug: schema.organizations.slug,
      organizationName: schema.organizations.name,
    }).from(schema.verifiedDomains)
      .innerJoin(schema.organizations, eq(schema.organizations.id, schema.verifiedDomains.organizationId))
      .innerJoin(schema.identityProviders, eq(schema.identityProviders.id, schema.verifiedDomains.providerId))
      .where(and(eq(schema.verifiedDomains.domain, domain), gt(schema.verifiedDomains.verifiedAt, new Date(0)), isNull(schema.identityProviders.deletedAt)))
      .limit(1);
    if (!match || !(await this.modules.isEnabled(match.organizationId, "enterprise_identity"))) throw new AppError("NOT_FOUND", "No enterprise identity provider is available for this domain");
    const config = (match.config ?? {}) as Record<string, unknown>;
    return {
      domain: match.domain,
      organization: { slug: match.organizationSlug, name: match.organizationName },
      provider: {
        id: match.providerId, kind: match.kind, name: match.name, issuerUrl: match.issuerUrl,
        clientId: match.clientId, enforcementMode: match.enforcementMode, testMode: match.testMode,
        status: match.status,
        authorizationEndpoint: typeof config.authorizationEndpoint === "string" ? config.authorizationEndpoint : undefined,
        loginUrl: typeof config.loginUrl === "string" ? config.loginUrl : undefined,
      },
    };
  }

  private async scimConnector(org: string, connectorId: string) {
    await this.enabled(org);
    const [connector] = await this.db.select().from(schema.directoryConnectors).where(and(
      eq(schema.directoryConnectors.organizationId, org), eq(schema.directoryConnectors.id, connectorId), isNull(schema.directoryConnectors.deletedAt),
    )).limit(1);
    if (!connector || connector.kind !== "scim") throw new AppError("NOT_FOUND", "SCIM connector not found");
    return connector;
  }

  async listScimUsers(org: string, connectorId: string) {
    await this.scimConnector(org, connectorId);
    const rows = await this.db.select().from(schema.externalIdentities).where(and(eq(schema.externalIdentities.organizationId, org), eq(schema.externalIdentities.connectorId, connectorId)));
    return rows.map((row) => ({
      schemas: ["urn:ietf:params:scim:schemas:core:2.0:User"], id: row.externalSubject,
      externalId: row.externalSubject, userName: row.email, displayName: (row.attributes as any)?.displayName ?? row.email,
      active: row.status === "active", groups: ((row.attributes as any)?.groups ?? []).map((value: string) => ({ value })),
      meta: { resourceType: "User", created: row.createdAt, lastModified: row.updatedAt },
    }));
  }

  async upsertScimUser(org: string, actorUserId: string, connectorId: string, entry: DirectoryEntry) {
    await this.scimConnector(org, connectorId);
    const email = entry.email.trim().toLowerCase();
    const mappings = await this.db.select().from(schema.provisioningMappings).where(eq(schema.provisioningMappings.connectorId, connectorId));
    const result = await this.db.transaction(async (tx) => {
      let [external] = await tx.select().from(schema.externalIdentities).where(and(eq(schema.externalIdentities.organizationId, org), eq(schema.externalIdentities.connectorId, connectorId), eq(schema.externalIdentities.externalSubject, entry.externalSubject))).limit(1);
      let userId = external?.userId ?? null;
      if (!userId) {
        const [existingUser] = await tx.select().from(schema.users).where(eq(schema.users.email, email)).limit(1);
        if (existingUser) userId = existingUser.id;
        else userId = (await tx.insert(schema.users).values({ email, displayName: entry.displayName, createdBy: actorUserId }).returning())[0].id;
      }
      await tx.insert(schema.organizationMemberships).values({ organizationId: org, userId, status: entry.active === false ? "inactive" : "active", createdBy: actorUserId })
        .onConflictDoUpdate({ target: [schema.organizationMemberships.organizationId, schema.organizationMemberships.userId], set: { status: entry.active === false ? "inactive" : "active", updatedBy: actorUserId, updatedAt: new Date() } });
      await tx.update(schema.users).set({ email, displayName: entry.displayName, isActive: entry.active !== false, updatedBy: actorUserId, updatedAt: new Date() }).where(eq(schema.users.id, userId));
      const attributes = { ...(entry.attributes ?? {}), displayName: entry.displayName, groups: entry.groups ?? [] };
      if (external) {
        [external] = await tx.update(schema.externalIdentities).set({ userId, email, attributes, status: entry.active === false ? "inactive" : "active", lastSeenAt: new Date(), updatedAt: new Date() }).where(eq(schema.externalIdentities.id, external.id)).returning();
      } else {
        [external] = await tx.insert(schema.externalIdentities).values({ organizationId: org, connectorId, externalSubject: entry.externalSubject, userId, email, attributes, status: entry.active === false ? "inactive" : "active", lastSeenAt: new Date() }).returning();
      }
      if (entry.active === false) await tx.update(schema.userSessions).set({ revokedAt: new Date() }).where(and(eq(schema.userSessions.userId, userId), isNull(schema.userSessions.revokedAt)));
      for (const mapping of mappings.filter((m) => (entry.groups ?? []).includes(m.externalGroup) && (!m.highRisk || m.approvedAt))) {
        if (mapping.targetRoleKey) await tx.insert(schema.userRoleAssignments).values({ organizationId: org, userId, roleKey: mapping.targetRoleKey, scopeType: "organization" }).onConflictDoNothing();
        if (mapping.targetTeamId) await tx.insert(schema.teamMembers).values({ organizationId: org, teamId: mapping.targetTeamId, userId }).onConflictDoNothing();
      }
      await tx.insert(schema.auditEvents).values({ scopeType: "organization", organizationId: org, actorUserId, action: entry.active === false ? "scim.user.deprovisioned" : "scim.user.provisioned", targetType: "external_identity", targetId: external.id, metadata: { connectorId, externalSubject: entry.externalSubject } });
      return external;
    });
    return { id: result.externalSubject, externalId: result.externalSubject, userName: result.email, active: result.status === "active", displayName: entry.displayName };
  }

  async deactivateScimUser(org: string, actorUserId: string, connectorId: string, externalSubject: string) {
    await this.scimConnector(org, connectorId);
    const [external] = await this.db.select().from(schema.externalIdentities).where(and(eq(schema.externalIdentities.organizationId, org), eq(schema.externalIdentities.connectorId, connectorId), eq(schema.externalIdentities.externalSubject, externalSubject))).limit(1);
    if (!external) throw new AppError("NOT_FOUND", "SCIM user not found");
    await this.db.transaction(async (tx) => {
      await tx.update(schema.externalIdentities).set({ status: "inactive", updatedAt: new Date() }).where(eq(schema.externalIdentities.id, external.id));
      if (external.userId) {
        await tx.update(schema.organizationMemberships).set({ status: "inactive", updatedBy: actorUserId, updatedAt: new Date() }).where(and(eq(schema.organizationMemberships.organizationId, org), eq(schema.organizationMemberships.userId, external.userId)));
        await tx.update(schema.userSessions).set({ revokedAt: new Date() }).where(and(eq(schema.userSessions.userId, external.userId), isNull(schema.userSessions.revokedAt)));
      }
      await tx.insert(schema.auditEvents).values({ scopeType: "organization", organizationId: org, actorUserId, action: "scim.user.deprovisioned", targetType: "external_identity", targetId: external.id, metadata: { connectorId, externalSubject } });
    });
    return { deleted: true };
  }

  async consumeBreakGlass(input: { organizationSlug: string; email: string; code: string }) {
    const [org] = await this.db.select().from(schema.organizations).where(and(eq(schema.organizations.slug, input.organizationSlug), eq(schema.organizations.status, "active"))).limit(1);
    if (!org || !(await this.modules.isEnabled(org.id, "enterprise_identity"))) throw new AppError("UNAUTHENTICATED", "Invalid recovery credentials");
    const [user] = await this.db.select().from(schema.users).where(eq(schema.users.email, input.email.trim().toLowerCase())).limit(1);
    if (!user || !user.isActive) throw new AppError("UNAUTHENTICATED", "Invalid recovery credentials");
    const [membership] = await this.db.select().from(schema.organizationMemberships).where(and(eq(schema.organizationMemberships.organizationId, org.id), eq(schema.organizationMemberships.userId, user.id), eq(schema.organizationMemberships.status, "active"))).limit(1);
    if (!membership) throw new AppError("UNAUTHENTICATED", "Invalid recovery credentials");
    const candidates = await this.db.select().from(schema.breakGlassCodes).where(and(eq(schema.breakGlassCodes.organizationId, org.id), eq(schema.breakGlassCodes.userId, user.id), isNull(schema.breakGlassCodes.usedAt), gt(schema.breakGlassCodes.expiresAt, new Date())));
    const incoming = Buffer.from(sha256(input.code));
    const match = candidates.find((candidate) => {
      const stored = Buffer.from(candidate.codeHash);
      return incoming.length === stored.length && timingSafeEqual(incoming, stored);
    });
    if (!match) throw new AppError("UNAUTHENTICATED", "Invalid recovery credentials");
    await this.db.transaction(async (tx) => {
      await tx.update(schema.breakGlassCodes).set({ usedAt: new Date() }).where(and(eq(schema.breakGlassCodes.id, match.id), isNull(schema.breakGlassCodes.usedAt)));
      await tx.insert(schema.auditEvents).values({ scopeType: "organization", organizationId: org.id, actorUserId: user.id, action: "sso.break_glass.used", targetType: "user", targetId: user.id, metadata: { codeId: match.id } });
    });
    return { userId: user.id, organizationId: org.id, displayName: user.displayName };
  }

  async addExemption(org: string, userId: string, input: { targetUserId: string; reason: string; expiresAt: string }) {
    await this.enabled(org);
    const [row] = await this.db.insert(schema.ssoExemptions).values({ organizationId: org, userId: input.targetUserId, reason: input.reason, expiresAt: new Date(input.expiresAt), createdByUserId: userId }).onConflictDoUpdate({ target: [schema.ssoExemptions.organizationId, schema.ssoExemptions.userId], set: { reason: input.reason, expiresAt: new Date(input.expiresAt), createdByUserId: userId } }).returning();
    return row;
  }

  async issueBreakGlass(org: string, userId: string, targetUserId: string) {
    await this.enabled(org);
    const token = issueToken(12);
    const [row] = await this.db.insert(schema.breakGlassCodes).values({ organizationId: org, userId: targetUserId, codeHash: token.hash, expiresAt: new Date(Date.now() + 30 * 60_000) }).returning();
    return { id: row.id, code: token.raw, expiresAt: row.expiresAt };
  }
}
