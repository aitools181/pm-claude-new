import { Injectable, Inject } from "@nestjs/common";
import { and, asc, count, desc, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { schema, type Database } from "@pm/db";
import { AppError } from "@pm/shared";
import { DB } from "../db/db.module.js";
import { canAccessProject, canAccessWorkItem } from "../collab/access.js";
import { WorkItemsService } from "../work/work-items.service.js";
import { rankBetween } from "../work/rank.js";
import { MailService } from "../mail/mail.service.js";
import { issueToken, sha256, verifyPassword } from "../common/crypto.js";

const DEFAULT_WIDGETS = [
  { widgetKey: "my_tasks", sortOrder: 0, size: "large" },
  { widgetKey: "projects", sortOrder: 1, size: "large" },
  { widgetKey: "people", sortOrder: 2, size: "medium" },
];

@Injectable()
export class UxService {
  constructor(@Inject(DB) private readonly db: Database, private readonly workItems: WorkItemsService, private readonly mail: MailService) {}

  async profile(org: string, userId: string) {
    const [row] = await this.db.select({ id: schema.users.id, displayName: schema.users.displayName, email: schema.users.email, emailVerifiedAt: schema.users.emailVerifiedAt })
      .from(schema.users).innerJoin(schema.organizationMemberships, eq(schema.organizationMemberships.userId, schema.users.id))
      .where(and(eq(schema.users.id, userId), eq(schema.organizationMemberships.organizationId, org), eq(schema.organizationMemberships.status, "active"))).limit(1);
    if (!row) throw new AppError("NOT_FOUND", "User profile not found");
    return row;
  }

  async updateProfile(org: string, userId: string, patch: { displayName?: string; username?: string | null; avatarUrl?: string | null; designation?: string | null; department?: string | null; managerUserId?: string | null; workingHours?: Record<string, unknown> | null; contactFields?: Record<string, unknown> | null }) {
    await this.profile(org, userId);
    if (patch.username) {
      const [taken] = await this.db.select({ id: schema.users.id }).from(schema.users)
        .where(and(eq(schema.users.username, patch.username), sql`${schema.users.id} <> ${userId}`)).limit(1);
      if (taken) throw new AppError("CONFLICT", "That username is already taken");
    }
    if (patch.managerUserId) {
      if (patch.managerUserId === userId) throw new AppError("VALIDATION", "A user cannot be their own manager");
      const [mgr] = await this.db.select({ id: schema.organizationMemberships.id }).from(schema.organizationMemberships)
        .where(and(eq(schema.organizationMemberships.organizationId, org), eq(schema.organizationMemberships.userId, patch.managerUserId), isNull(schema.organizationMemberships.deletedAt))).limit(1);
      if (!mgr) throw new AppError("VALIDATION", "Manager must be a member of this organization");
    }
    const [row] = await this.db.update(schema.users).set({ ...patch, updatedBy: userId, updatedAt: new Date(), version: sql`${schema.users.version}+1` }).where(eq(schema.users.id, userId)).returning({ id: schema.users.id, displayName: schema.users.displayName, username: schema.users.username, email: schema.users.email, emailVerifiedAt: schema.users.emailVerifiedAt, avatarUrl: schema.users.avatarUrl, designation: schema.users.designation, department: schema.users.department, managerUserId: schema.users.managerUserId, workingHours: schema.users.workingHours, contactFields: schema.users.contactFields });
    return row;
  }

  async workspaceSettings(org: string) {
    const [[organization], [settings]] = await Promise.all([
      this.db.select().from(schema.organizations).where(eq(schema.organizations.id, org)).limit(1),
      this.db.select().from(schema.organizationSettings).where(eq(schema.organizationSettings.organizationId, org)).limit(1),
    ]);
    if (!organization) throw new AppError("NOT_FOUND", "Workspace not found");
    return { organization, settings };
  }

  async updateWorkspaceSettings(org: string, userId: string, input: { name?: string; timezone?: string; weekStart?: number; dateFormat?: string; timeFormat?: string; numberFormat?: string; workingDays?: number[] | null; fiscalYearStartMonth?: number; retentionDays?: number | null; passwordPolicy?: Record<string, unknown> | null; branding?: Record<string, unknown> }) {
    return this.db.transaction(async (tx) => {
      if (input.name) await tx.update(schema.organizations).set({ name: input.name, updatedBy: userId, updatedAt: new Date(), version: sql`${schema.organizations.version}+1` }).where(eq(schema.organizations.id, org));
      const settingsPatch: Record<string, unknown> = {};
      if (input.timezone !== undefined) settingsPatch.timezone = input.timezone;
      if (input.weekStart !== undefined) settingsPatch.weekStart = input.weekStart;
      if (input.dateFormat !== undefined) settingsPatch.dateFormat = input.dateFormat;
      if (input.timeFormat !== undefined) settingsPatch.timeFormat = input.timeFormat;
      if (input.numberFormat !== undefined) settingsPatch.numberFormat = input.numberFormat;
      if (input.workingDays !== undefined) settingsPatch.workingDays = input.workingDays;
      if (input.fiscalYearStartMonth !== undefined) settingsPatch.fiscalYearStartMonth = input.fiscalYearStartMonth;
      if (input.retentionDays !== undefined) settingsPatch.retentionDays = input.retentionDays;
      if (input.passwordPolicy !== undefined) settingsPatch.passwordPolicy = input.passwordPolicy;
      if (input.branding !== undefined) settingsPatch.branding = input.branding;
      if (Object.keys(settingsPatch).length) {
        const existing = await tx.select({ id: schema.organizationSettings.organizationId }).from(schema.organizationSettings).where(eq(schema.organizationSettings.organizationId, org)).limit(1);
        if (existing[0]) await tx.update(schema.organizationSettings).set({ ...settingsPatch, updatedBy: userId, updatedAt: new Date(), version: sql`${schema.organizationSettings.version}+1` }).where(eq(schema.organizationSettings.organizationId, org));
        else await tx.insert(schema.organizationSettings).values({ organizationId: org, ...settingsPatch, createdBy: userId });
      }
      return this.workspaceSettings(org);
    });
  }

  async notificationPreferences(org: string, userId: string) {
    return this.db.select().from(schema.notificationPreferences).where(and(eq(schema.notificationPreferences.organizationId, org), eq(schema.notificationPreferences.userId, userId))).orderBy(asc(schema.notificationPreferences.type), asc(schema.notificationPreferences.channel));
  }

  async setNotificationPreference(org: string, userId: string, type: string, channel: string, enabled: boolean) {
    const rows = await this.db.insert(schema.notificationPreferences).values({ organizationId: org, userId, type, channel, enabled: enabled ? "true" : "false" }).onConflictDoNothing().returning();
    if (rows[0]) return rows[0];
    const [row] = await this.db.update(schema.notificationPreferences).set({ enabled: enabled ? "true" : "false" }).where(and(eq(schema.notificationPreferences.organizationId, org), eq(schema.notificationPreferences.userId, userId), eq(schema.notificationPreferences.type, type), eq(schema.notificationPreferences.channel, channel))).returning();
    return row;
  }

  async emailForwarding(org: string, userId: string) {
    let [row] = await this.db.select().from(schema.userEmailForwarding).where(and(eq(schema.userEmailForwarding.organizationId, org), eq(schema.userEmailForwarding.userId, userId))).limit(1);
    if (!row) {
      const domain = process.env.PM_FORWARDING_DOMAIN || "tasks.local";
      [row] = await this.db.insert(schema.userEmailForwarding).values({ organizationId: org, userId, address: `task+${org.slice(0,8)}-${userId.slice(0,8)}@${domain}` }).returning();
    }
    return row;
  }

  async updateEmailForwarding(org: string, userId: string, patch: { enabled?: boolean; destinationProjectId?: string | null }) {
    await this.emailForwarding(org, userId);
    if (patch.destinationProjectId && !(await canAccessProject(this.db, org, patch.destinationProjectId, userId))) throw new AppError("FORBIDDEN", "No access to the destination project");
    const [row] = await this.db.update(schema.userEmailForwarding).set(patch).where(and(eq(schema.userEmailForwarding.organizationId, org), eq(schema.userEmailForwarding.userId, userId))).returning();
    return row;
  }

  async emailAddresses(userId: string) {
    const [user] = await this.db.select({ id: schema.users.id, email: schema.users.email, emailVerifiedAt: schema.users.emailVerifiedAt }).from(schema.users).where(eq(schema.users.id, userId)).limit(1);
    if (!user) throw new AppError("NOT_FOUND", "User not found");
    const secondary = await this.db.select({ id: schema.userEmailAddresses.id, email: schema.userEmailAddresses.email, label: schema.userEmailAddresses.label, verifiedAt: schema.userEmailAddresses.verifiedAt, createdAt: schema.userEmailAddresses.createdAt })
      .from(schema.userEmailAddresses).where(eq(schema.userEmailAddresses.userId, userId)).orderBy(asc(schema.userEmailAddresses.createdAt));
    return [{ id: "primary", email: user.email, label: "Primary", verifiedAt: user.emailVerifiedAt, primary: true }, ...secondary.map((row) => ({ ...row, primary: false }))];
  }

  async addEmailAddress(userId: string, rawEmail: string, label?: string) {
    const email = rawEmail.trim().toLowerCase();
    const [primaryOwner] = await this.db.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.email, email)).limit(1);
    if (primaryOwner) throw new AppError("CONFLICT", primaryOwner.id === userId ? "This is already your primary email" : "That email is already used by another account");
    const [aliasOwner] = await this.db.select({ id: schema.userEmailAddresses.id, userId: schema.userEmailAddresses.userId }).from(schema.userEmailAddresses).where(eq(schema.userEmailAddresses.email, email)).limit(1);
    if (aliasOwner) throw new AppError("CONFLICT", aliasOwner.userId === userId ? "That email is already on your account" : "That email is already used by another account");
    const { raw, hash } = issueToken();
    const [row] = await this.db.insert(schema.userEmailAddresses).values({ userId, email, label: label?.trim() || null, verificationTokenHash: hash, verificationExpiresAt: new Date(Date.now() + 30 * 60 * 1000) }).returning();
    const base = process.env.PUBLIC_WEB_URL || "http://localhost:3000";
    await this.mail.send(email, "Verify your additional PM Platform email", `Open ${base.replace(/\/$/, "")}/settings/account?verifySecondary=${encodeURIComponent(raw)} to verify this email address. This link expires in 30 minutes.`);
    return { id: row.id, email: row.email, label: row.label, verifiedAt: row.verifiedAt, verificationSent: true };
  }

  async verifyEmailAddress(userId: string, token: string) {
    const [row] = await this.db.select().from(schema.userEmailAddresses).where(and(eq(schema.userEmailAddresses.userId, userId), eq(schema.userEmailAddresses.verificationTokenHash, sha256(token)))).limit(1);
    if (!row || !row.verificationExpiresAt || row.verificationExpiresAt <= new Date()) throw new AppError("VALIDATION", "Invalid or expired email verification link");
    const [updated] = await this.db.update(schema.userEmailAddresses).set({ verifiedAt: new Date(), verificationTokenHash: null, verificationExpiresAt: null }).where(eq(schema.userEmailAddresses.id, row.id)).returning();
    return { verified: true, email: updated.email, id: updated.id };
  }

  async makePrimaryEmail(userId: string, id: string) {
    return this.db.transaction(async (tx) => {
      const [alias] = await tx.select().from(schema.userEmailAddresses).where(and(eq(schema.userEmailAddresses.id, id), eq(schema.userEmailAddresses.userId, userId))).limit(1);
      if (!alias) throw new AppError("NOT_FOUND", "Email address not found");
      if (!alias.verifiedAt) throw new AppError("VALIDATION", "Verify this email before making it primary");
      const [user] = await tx.select({ email: schema.users.email, emailVerifiedAt: schema.users.emailVerifiedAt }).from(schema.users).where(eq(schema.users.id, userId)).limit(1);
      if (!user) throw new AppError("NOT_FOUND", "User not found");
      await tx.update(schema.users).set({ email: alias.email, emailVerifiedAt: alias.verifiedAt, updatedAt: new Date() }).where(eq(schema.users.id, userId));
      await tx.update(schema.userEmailAddresses).set({ email: user.email, verifiedAt: user.emailVerifiedAt ?? new Date(), label: alias.label || "Previous primary" }).where(eq(schema.userEmailAddresses.id, id));
      return { primaryEmail: alias.email, secondaryEmail: user.email };
    });
  }

  async removeEmailAddress(userId: string, id: string) {
    await this.db.delete(schema.userEmailAddresses).where(and(eq(schema.userEmailAddresses.id, id), eq(schema.userEmailAddresses.userId, userId)));
  }

  async myWorkspaces(userId: string) {
    return this.db.select({ organizationId: schema.organizations.id, organizationName: schema.organizations.name, organizationSlug: schema.organizations.slug, membershipStatus: schema.organizationMemberships.status })
      .from(schema.organizationMemberships).innerJoin(schema.organizations, eq(schema.organizations.id, schema.organizationMemberships.organizationId))
      .where(and(eq(schema.organizationMemberships.userId, userId), isNull(schema.organizationMemberships.deletedAt))).orderBy(asc(schema.organizations.name));
  }

  async mergeAccount(currentUserId: string, rawEmail: string, password: string) {
    const email = rawEmail.trim().toLowerCase();
    let [other] = await this.db.select().from(schema.users).where(eq(schema.users.email, email)).limit(1);
    if (!other) {
      const [alias] = await this.db.select({ userId: schema.userEmailAddresses.userId }).from(schema.userEmailAddresses).where(and(eq(schema.userEmailAddresses.email, email), sql`${schema.userEmailAddresses.verifiedAt} is not null`)).limit(1);
      if (alias) [other] = await this.db.select().from(schema.users).where(eq(schema.users.id, alias.userId)).limit(1);
    }
    if (!other || !other.isActive) throw new AppError("NOT_FOUND", "The other account could not be found");
    if (other.id === currentUserId) throw new AppError("VALIDATION", "That email already belongs to this account");
    const [cred] = await this.db.select().from(schema.userCredentials).where(eq(schema.userCredentials.userId, other.id)).limit(1);
    if (!cred || !(await verifyPassword(cred.passwordHash, password))) throw new AppError("UNAUTHENTICATED", "Password for the other account is incorrect");

    await this.db.transaction(async (tx) => {
      const [current] = await tx.select().from(schema.users).where(eq(schema.users.id, currentUserId)).limit(1);
      if (!current) throw new AppError("NOT_FOUND", "Current account not found");
      await tx.insert(schema.userEmailAddresses).values({ userId: currentUserId, email: other.email, label: "Merged account", verifiedAt: other.emailVerifiedAt ?? new Date() }).onConflictDoNothing();
      const aliases = await tx.select().from(schema.userEmailAddresses).where(eq(schema.userEmailAddresses.userId, other.id));
      for (const a of aliases) {
        const [exists] = await tx.select({ id: schema.userEmailAddresses.id }).from(schema.userEmailAddresses).where(eq(schema.userEmailAddresses.email, a.email)).limit(1);
        if (exists?.id !== a.id) await tx.delete(schema.userEmailAddresses).where(eq(schema.userEmailAddresses.id, a.id));
        else await tx.update(schema.userEmailAddresses).set({ userId: currentUserId, label: a.label || "Merged account" }).where(eq(schema.userEmailAddresses.id, a.id));
      }

      const memberships = await tx.select().from(schema.organizationMemberships).where(eq(schema.organizationMemberships.userId, other.id));
      for (const m of memberships) {
        const [exists] = await tx.select({ id: schema.organizationMemberships.id }).from(schema.organizationMemberships).where(and(eq(schema.organizationMemberships.organizationId, m.organizationId), eq(schema.organizationMemberships.userId, currentUserId))).limit(1);
        if (exists) await tx.delete(schema.organizationMemberships).where(eq(schema.organizationMemberships.id, m.id));
        else await tx.update(schema.organizationMemberships).set({ userId: currentUserId }).where(eq(schema.organizationMemberships.id, m.id));
      }
      const transferUnique = async (table: any, scopeColumn: any, userColumn: any, scopeKey: string) => {
        const rows = await tx.select().from(table).where(eq(userColumn, other.id));
        for (const row of rows as any[]) {
          const [exists] = await tx.select().from(table).where(and(eq(scopeColumn, row[scopeKey]), eq(userColumn, currentUserId))).limit(1);
          if (exists) await tx.delete(table).where(eq(table.id, row.id));
          else await tx.update(table).set({ userId: currentUserId }).where(eq(table.id, row.id));
        }
      };
      await transferUnique(schema.workspaceMembers, schema.workspaceMembers.workspaceId, schema.workspaceMembers.userId, "workspaceId");
      await transferUnique(schema.projectMembers, schema.projectMembers.projectId, schema.projectMembers.userId, "projectId");
      await transferUnique(schema.teamMembers, schema.teamMembers.teamId, schema.teamMembers.userId, "teamId");
      await transferUnique(schema.workItemAssignees, schema.workItemAssignees.workItemId, schema.workItemAssignees.userId, "workItemId");
      await transferUnique(schema.workItemWatchers, schema.workItemWatchers.workItemId, schema.workItemWatchers.userId, "workItemId");
      await tx.update(schema.projects).set({ ownerUserId: currentUserId }).where(eq(schema.projects.ownerUserId, other.id));
      await tx.update(schema.portfolios).set({ ownerUserId: currentUserId }).where(eq(schema.portfolios.ownerUserId, other.id));
      await tx.update(schema.goals).set({ ownerUserId: currentUserId }).where(eq(schema.goals.ownerUserId, other.id));
      await tx.update(schema.workItems).set({ primaryOwnerUserId: currentUserId }).where(eq(schema.workItems.primaryOwnerUserId, other.id));
      await tx.update(schema.userSessions).set({ revokedAt: new Date() }).where(and(eq(schema.userSessions.userId, other.id), isNull(schema.userSessions.revokedAt)));
      await tx.update(schema.users).set({ isActive: false, updatedAt: new Date() }).where(eq(schema.users.id, other.id));
    });
    return { merged: true, mergedEmail: other.email };
  }

  async preferences(org: string, userId: string) {
    let [row] = await this.db.select().from(schema.userUiPreferences)
      .where(and(eq(schema.userUiPreferences.organizationId, org), eq(schema.userUiPreferences.userId, userId))).limit(1);
    if (!row) [row] = await this.db.insert(schema.userUiPreferences).values({ organizationId: org, userId }).returning();
    const [workspace] = await this.db.select({ weekStart: schema.organizationSettings.weekStart })
      .from(schema.organizationSettings).where(eq(schema.organizationSettings.organizationId, org)).limit(1);
    return { ...row, workspaceWeekStart: workspace?.weekStart ?? 1 };
  }

  async updatePreferences(org: string, userId: string, patch: Partial<{ themeMode: string; chromeTone: string; colorPreset: string; customAccent: string | null; homeBackground: string; density: string; locale: string; personalWeekStart: number | null; notificationPopupSeconds: number; defaultLanding: string; showRowNumbers: boolean; colorBlindMode: boolean; celebrations: boolean; inboxSummaryEnabled: boolean; inboxSummaryTimeframe: string; navigationPreferences: Record<string, unknown>; customTheme: Record<string, unknown> }>) {
    await this.preferences(org, userId);
    const [row] = await this.db.update(schema.userUiPreferences).set({ ...patch, updatedAt: new Date() })
      .where(and(eq(schema.userUiPreferences.organizationId, org), eq(schema.userUiPreferences.userId, userId))).returning();
    return row;
  }

  async homeWidgets(org: string, userId: string) {
    let rows = await this.db.select().from(schema.userHomeWidgets)
      .where(and(eq(schema.userHomeWidgets.organizationId, org), eq(schema.userHomeWidgets.userId, userId))).orderBy(asc(schema.userHomeWidgets.sortOrder));
    if (!rows.length) {
      await this.db.insert(schema.userHomeWidgets).values(DEFAULT_WIDGETS.map((r) => ({ organizationId: org, userId, ...r })));
      rows = await this.db.select().from(schema.userHomeWidgets)
        .where(and(eq(schema.userHomeWidgets.organizationId, org), eq(schema.userHomeWidgets.userId, userId))).orderBy(asc(schema.userHomeWidgets.sortOrder));
    }
    return rows;
  }

  async saveHomeWidgets(org: string, userId: string, rows: Array<{ widgetKey: string; enabled: boolean; sortOrder: number; size?: string; config?: Record<string, unknown> }>) {
    return this.db.transaction(async (tx) => {
      await tx.delete(schema.userHomeWidgets).where(and(eq(schema.userHomeWidgets.organizationId, org), eq(schema.userHomeWidgets.userId, userId)));
      if (rows.length) await tx.insert(schema.userHomeWidgets).values(rows.map((r) => ({ organizationId: org, userId, widgetKey: r.widgetKey, enabled: r.enabled, sortOrder: r.sortOrder, size: r.size ?? "medium", config: r.config ?? {} })));
      return rows;
    });
  }

  listSavedViews(org: string, userId: string, scopeType: string, scopeId?: string) {
    const conds = [eq(schema.savedUiViews.organizationId, org), eq(schema.savedUiViews.userId, userId), eq(schema.savedUiViews.scopeType, scopeType)];
    if (scopeId) conds.push(eq(schema.savedUiViews.scopeId, scopeId)); else conds.push(isNull(schema.savedUiViews.scopeId));
    return this.db.select().from(schema.savedUiViews).where(and(...conds)).orderBy(asc(schema.savedUiViews.createdAt));
  }

  async createSavedView(org: string, userId: string, input: { scopeType: string; scopeId?: string; name: string; viewType?: string; filters?: Record<string, unknown>; columns?: unknown[]; sortSpec?: Record<string, unknown>; groupBy?: string | null; isDefault?: boolean }) {
    return this.db.transaction(async (tx) => {
      if (input.isDefault) {
        const conds = [eq(schema.savedUiViews.organizationId, org), eq(schema.savedUiViews.userId, userId), eq(schema.savedUiViews.scopeType, input.scopeType)];
        if (input.scopeId) conds.push(eq(schema.savedUiViews.scopeId, input.scopeId)); else conds.push(isNull(schema.savedUiViews.scopeId));
        await tx.update(schema.savedUiViews).set({ isDefault: false, updatedAt: new Date() }).where(and(...conds));
      }
      const [row] = await tx.insert(schema.savedUiViews).values({ organizationId: org, userId, scopeType: input.scopeType, scopeId: input.scopeId, name: input.name, viewType: input.viewType ?? "list", filters: input.filters ?? {}, columns: input.columns ?? [], sortSpec: input.sortSpec ?? {}, groupBy: input.groupBy, isDefault: input.isDefault ?? false }).returning();
      return row;
    });
  }

  async updateSavedView(org: string, userId: string, id: string, patch: Partial<{ name: string; viewType: string; filters: Record<string, unknown>; columns: unknown[]; sortSpec: Record<string, unknown>; groupBy: string | null; isDefault: boolean }>) {
    const [current] = await this.db.select().from(schema.savedUiViews).where(and(eq(schema.savedUiViews.id, id), eq(schema.savedUiViews.organizationId, org), eq(schema.savedUiViews.userId, userId))).limit(1);
    if (!current) throw new AppError("NOT_FOUND", "Saved view not found");
    return this.db.transaction(async (tx) => {
      if (patch.isDefault) {
        const conds = [eq(schema.savedUiViews.organizationId, org), eq(schema.savedUiViews.userId, userId), eq(schema.savedUiViews.scopeType, current.scopeType)];
        if (current.scopeId) conds.push(eq(schema.savedUiViews.scopeId, current.scopeId)); else conds.push(isNull(schema.savedUiViews.scopeId));
        await tx.update(schema.savedUiViews).set({ isDefault: false, updatedAt: new Date() }).where(and(...conds));
      }
      const [row] = await tx.update(schema.savedUiViews).set({ ...patch, updatedAt: new Date() }).where(eq(schema.savedUiViews.id, id)).returning();
      return row;
    });
  }

  async duplicateSavedView(org: string, userId: string, id: string) {
    const [current] = await this.db.select().from(schema.savedUiViews).where(and(eq(schema.savedUiViews.id, id), eq(schema.savedUiViews.organizationId, org), eq(schema.savedUiViews.userId, userId))).limit(1);
    if (!current) throw new AppError("NOT_FOUND", "Saved view not found");
    const [row] = await this.db.insert(schema.savedUiViews).values({ organizationId: org, userId, scopeType: current.scopeType, scopeId: current.scopeId, name: `${current.name} copy`, viewType: current.viewType, filters: current.filters, columns: current.columns, sortSpec: current.sortSpec, groupBy: current.groupBy, isDefault: false }).returning();
    return row;
  }

  async deleteSavedView(org: string, userId: string, id: string) {
    await this.db.delete(schema.savedUiViews).where(and(eq(schema.savedUiViews.id, id), eq(schema.savedUiViews.organizationId, org), eq(schema.savedUiViews.userId, userId)));
  }

  async teams(org: string) {
    const rows = await this.db.select().from(schema.teams).where(and(eq(schema.teams.organizationId, org), isNull(schema.teams.deletedAt))).orderBy(asc(schema.teams.name));
    return Promise.all(rows.map(async (team) => { const [{ n }] = await this.db.select({ n: count() }).from(schema.teamMembers).where(and(eq(schema.teamMembers.organizationId, org), eq(schema.teamMembers.teamId, team.id), isNull(schema.teamMembers.deletedAt))); return { ...team, memberCount: Number(n) }; }));
  }

  private async assertOrgMember(org: string, userId: string, label: string) {
    const [m] = await this.db.select({ id: schema.organizationMemberships.id }).from(schema.organizationMemberships)
      .where(and(eq(schema.organizationMemberships.organizationId, org), eq(schema.organizationMemberships.userId, userId), isNull(schema.organizationMemberships.deletedAt))).limit(1);
    if (!m) throw new AppError("VALIDATION", `${label} must be a member of this organization`);
  }

  async createTeam(org: string, userId: string, input: { name: string; leaderUserId?: string | null; parentTeamId?: string | null; description?: string | null }) {
    if (input.leaderUserId) await this.assertOrgMember(org, input.leaderUserId, "Team leader");
    if (input.parentTeamId) {
      const [parent] = await this.db.select({ id: schema.teams.id }).from(schema.teams).where(and(eq(schema.teams.id, input.parentTeamId), eq(schema.teams.organizationId, org), isNull(schema.teams.deletedAt))).limit(1);
      if (!parent) throw new AppError("VALIDATION", "Parent team not found");
    }
    const [row] = await this.db.insert(schema.teams).values({ organizationId: org, name: input.name, leaderUserId: input.leaderUserId ?? null, parentTeamId: input.parentTeamId ?? null, description: input.description ?? null, createdBy: userId }).returning();
    return row;
  }

  async updateTeam(org: string, userId: string, teamId: string, patch: { name?: string; leaderUserId?: string | null; parentTeamId?: string | null; description?: string | null }) {
    if (patch.leaderUserId) await this.assertOrgMember(org, patch.leaderUserId, "Team leader");
    if (patch.parentTeamId) {
      if (patch.parentTeamId === teamId) throw new AppError("VALIDATION", "A team cannot be its own parent");
      // reject cycles: walk up from the proposed parent
      let cursor: string | null = patch.parentTeamId;
      for (let hop = 0; cursor && hop < 20; hop += 1) {
        if (cursor === teamId) throw new AppError("VALIDATION", "Parent assignment would create a cycle");
        const [p]: { parentTeamId: string | null }[] = await this.db.select({ parentTeamId: schema.teams.parentTeamId }).from(schema.teams).where(and(eq(schema.teams.id, cursor), eq(schema.teams.organizationId, org))).limit(1);
        cursor = p?.parentTeamId ?? null;
      }
    }
    const [row] = await this.db.update(schema.teams).set({ ...patch, updatedBy: userId, updatedAt: new Date(), version: sql`${schema.teams.version}+1` })
      .where(and(eq(schema.teams.id, teamId), eq(schema.teams.organizationId, org), isNull(schema.teams.deletedAt))).returning();
    if (!row) throw new AppError("NOT_FOUND", "Team not found");
    return row;
  }

  async deleteTeam(org: string, userId: string, teamId: string) {
    await this.db.update(schema.teams).set({ deletedAt: new Date(), deletedBy: userId }).where(and(eq(schema.teams.id, teamId), eq(schema.teams.organizationId, org)));
    return { ok: true };
  }

  async teamMembers(org: string, teamId: string) {
    return this.db.select({ userId: schema.teamMembers.userId, displayName: schema.users.displayName, email: schema.users.email, effectiveFrom: schema.teamMembers.effectiveFrom, effectiveTo: schema.teamMembers.effectiveTo })
      .from(schema.teamMembers).innerJoin(schema.users, eq(schema.users.id, schema.teamMembers.userId))
      .where(and(eq(schema.teamMembers.organizationId, org), eq(schema.teamMembers.teamId, teamId), isNull(schema.teamMembers.deletedAt)))
      .orderBy(asc(schema.users.displayName));
  }

  async addTeamMember(org: string, userId: string, teamId: string, input: { userId: string; effectiveFrom?: string | null; effectiveTo?: string | null }) {
    await this.assertOrgMember(org, input.userId, "Team member");
    if (input.effectiveFrom && input.effectiveTo && input.effectiveTo < input.effectiveFrom) throw new AppError("VALIDATION", "Effective end date must be on or after the start date");
    const [existing] = await this.db.select({ id: schema.teamMembers.id, deletedAt: schema.teamMembers.deletedAt }).from(schema.teamMembers)
      .where(and(eq(schema.teamMembers.organizationId, org), eq(schema.teamMembers.teamId, teamId), eq(schema.teamMembers.userId, input.userId))).limit(1);
    if (existing && !existing.deletedAt) throw new AppError("CONFLICT", "This person is already on the team");
    if (existing) {
      const [row] = await this.db.update(schema.teamMembers).set({ deletedAt: null, deletedBy: null, effectiveFrom: input.effectiveFrom ?? null, effectiveTo: input.effectiveTo ?? null, updatedBy: userId, updatedAt: new Date() }).where(eq(schema.teamMembers.id, existing.id)).returning();
      return row;
    }
    const [row] = await this.db.insert(schema.teamMembers).values({ organizationId: org, teamId, userId: input.userId, effectiveFrom: input.effectiveFrom ?? null, effectiveTo: input.effectiveTo ?? null, createdBy: userId }).returning();
    return row;
  }

  async removeTeamMember(org: string, actorId: string, teamId: string, memberUserId: string) {
    await this.db.update(schema.teamMembers).set({ deletedAt: new Date(), deletedBy: actorId })
      .where(and(eq(schema.teamMembers.organizationId, org), eq(schema.teamMembers.teamId, teamId), eq(schema.teamMembers.userId, memberUserId)));
    return { ok: true };
  }

  /** F03 deactivation wizard step 1: everything this person still owns in the org. */
  async ownedSummary(org: string, targetUserId: string) {
    const [projects, workItems, forms, automations, documents] = await Promise.all([
      this.db.select({ id: schema.projects.id, name: schema.projects.name }).from(schema.projects).where(and(eq(schema.projects.organizationId, org), eq(schema.projects.ownerUserId, targetUserId), isNull(schema.projects.deletedAt))),
      this.db.select({ n: count() }).from(schema.workItems).where(and(eq(schema.workItems.organizationId, org), eq(schema.workItems.primaryOwnerUserId, targetUserId), isNull(schema.workItems.deletedAt))).then((r) => Number(r[0]?.n ?? 0)),
      this.db.select({ n: count() }).from(schema.forms).where(and(eq(schema.forms.organizationId, org), eq(schema.forms.createdByUserId, targetUserId))).then((r) => Number(r[0]?.n ?? 0)).catch(() => 0),
      this.db.select({ n: count() }).from(schema.automationRules).where(and(eq(schema.automationRules.organizationId, org), eq(schema.automationRules.createdBy, targetUserId), isNull(schema.automationRules.deletedAt))).then((r) => Number(r[0]?.n ?? 0)).catch(() => 0),
      this.db.select({ n: count() }).from(schema.documents).where(and(eq(schema.documents.organizationId, org), eq(schema.documents.ownerUserId, targetUserId))).then((r) => Number(r[0]?.n ?? 0)).catch(() => 0),
    ]);
    return { projects, counts: { projects: projects.length, workItems, forms, automations, documents } };
  }

  /** F03 deactivation wizard step 2: transfer ownership, then suspend membership. */
  async deactivateMember(org: string, actorId: string, targetUserId: string, input: { reassignToUserId: string; reason?: string }) {
    if (targetUserId === actorId) throw new AppError("VALIDATION", "You cannot deactivate yourself");
    if (input.reassignToUserId === targetUserId) throw new AppError("VALIDATION", "Ownership cannot be reassigned to the user being deactivated");
    await this.assertOrgMember(org, targetUserId, "Target user");
    await this.assertOrgMember(org, input.reassignToUserId, "Reassignment target");
    const now = new Date();
    return this.db.transaction(async (tx) => {
      const [projMoved, itemsMoved] = await Promise.all([
        tx.update(schema.projects).set({ ownerUserId: input.reassignToUserId, updatedBy: actorId, updatedAt: now }).where(and(eq(schema.projects.organizationId, org), eq(schema.projects.ownerUserId, targetUserId), isNull(schema.projects.deletedAt))).returning({ id: schema.projects.id }),
        tx.update(schema.workItems).set({ primaryOwnerUserId: input.reassignToUserId, updatedBy: actorId, updatedAt: now }).where(and(eq(schema.workItems.organizationId, org), eq(schema.workItems.primaryOwnerUserId, targetUserId), isNull(schema.workItems.deletedAt))).returning({ id: schema.workItems.id }),
      ]);
      await tx.update(schema.organizationMemberships).set({ status: "suspended", updatedBy: actorId, updatedAt: now })
        .where(and(eq(schema.organizationMemberships.organizationId, org), eq(schema.organizationMemberships.userId, targetUserId)));
      await tx.insert(schema.auditEvents).values({ scopeType: "organization", organizationId: org, actorUserId: actorId, action: "member.deactivated", targetType: "user", targetId: targetUserId, metadata: { reassignToUserId: input.reassignToUserId, reason: input.reason ?? null, projectsReassigned: projMoved.length, workItemsReassigned: itemsMoved.length } });
      return { ok: true, projectsReassigned: projMoved.length, workItemsReassigned: itemsMoved.length };
    });
  }

  /** F01: file-storage footprint for the workspace settings page. */
  async storageUsage(org: string) {
    const [row] = await this.db.select({ files: sql<number>`count(*)::int`, bytes: sql<number>`coalesce(sum(${schema.attachmentVersions.bytes}), 0)::bigint` })
      .from(schema.attachmentVersions).where(eq(schema.attachmentVersions.organizationId, org));
    return { files: Number(row.files), bytes: Number(row.bytes), megabytes: Math.round(Number(row.bytes) / 1048576 * 100) / 100 };
  }

  async directory(org: string) {
    return this.db.select({ id: schema.users.id, displayName: schema.users.displayName, email: schema.users.email, status: schema.organizationMemberships.status, accountType: schema.organizationMemberships.accountType, avatarUrl: schema.users.avatarUrl, designation: schema.users.designation, department: schema.users.department, managerUserId: schema.users.managerUserId })
      .from(schema.organizationMemberships).innerJoin(schema.users, eq(schema.users.id, schema.organizationMemberships.userId))
      .where(and(eq(schema.organizationMemberships.organizationId, org), eq(schema.organizationMemberships.status, "active"), isNull(schema.organizationMemberships.deletedAt), eq(schema.users.isActive, true)))
      .orderBy(asc(schema.users.displayName));
  }

  async sections(org: string, userId: string, projectId: string) {
    if (!(await canAccessProject(this.db, org, projectId, userId))) throw new AppError("FORBIDDEN", "No access to the project");
    return this.db.select().from(schema.sections).where(and(eq(schema.sections.organizationId, org), eq(schema.sections.projectId, projectId), isNull(schema.sections.deletedAt))).orderBy(asc(schema.sections.rank));
  }

  async createSection(org: string, userId: string, projectId: string, name: string) {
    if (!(await canAccessProject(this.db, org, projectId, userId))) throw new AppError("FORBIDDEN", "No access to the project");
    const [last] = await this.db.select({ rank: schema.sections.rank }).from(schema.sections).where(and(eq(schema.sections.organizationId, org), eq(schema.sections.projectId, projectId), isNull(schema.sections.deletedAt))).orderBy(desc(schema.sections.rank)).limit(1);
    const [row] = await this.db.insert(schema.sections).values({ organizationId: org, projectId, name, rank: rankBetween(last?.rank ?? null, null), createdBy: userId }).returning();
    return row;
  }

  async updateSection(org: string, userId: string, projectId: string, sectionId: string, patch: { name?: string; rank?: string }) {
    if (!(await canAccessProject(this.db, org, projectId, userId))) throw new AppError("FORBIDDEN", "No access to the project");
    const [row] = await this.db.update(schema.sections).set({ ...patch, updatedBy: userId, updatedAt: new Date(), version: sql`${schema.sections.version}+1` })
      .where(and(eq(schema.sections.id, sectionId), eq(schema.sections.organizationId, org), eq(schema.sections.projectId, projectId), isNull(schema.sections.deletedAt))).returning();
    if (!row) throw new AppError("NOT_FOUND", "Section not found");
    return row;
  }

  async deleteSection(org: string, userId: string, projectId: string, sectionId: string) {
    if (!(await canAccessProject(this.db, org, projectId, userId))) throw new AppError("FORBIDDEN", "No access to the project");
    await this.db.transaction(async (tx) => {
      await tx.update(schema.workItemPlacements).set({ sectionId: null, updatedBy: userId, updatedAt: new Date() }).where(and(eq(schema.workItemPlacements.organizationId, org), eq(schema.workItemPlacements.projectId, projectId), eq(schema.workItemPlacements.sectionId, sectionId)));
      await tx.update(schema.sections).set({ deletedAt: new Date(), deletedBy: userId }).where(and(eq(schema.sections.organizationId, org), eq(schema.sections.projectId, projectId), eq(schema.sections.id, sectionId)));
    });
  }

  async moveToSection(org: string, userId: string, itemId: string, sectionId: string | null) {
    if (!(await canAccessWorkItem(this.db, org, itemId, userId))) throw new AppError("FORBIDDEN", "No access to the work item");
    const [item] = await this.db.select({ projectId: schema.workItems.owningProjectId }).from(schema.workItems).where(and(eq(schema.workItems.id, itemId), eq(schema.workItems.organizationId, org))).limit(1);
    if (!item) throw new AppError("NOT_FOUND", "Work item not found");
    if (sectionId) {
      const [section] = await this.db.select({ id: schema.sections.id }).from(schema.sections).where(and(eq(schema.sections.id, sectionId), eq(schema.sections.organizationId, org), eq(schema.sections.projectId, item.projectId), isNull(schema.sections.deletedAt))).limit(1);
      if (!section) throw new AppError("VALIDATION", "Section does not belong to the owning project");
    }
    const [row] = await this.db.update(schema.workItemPlacements).set({ sectionId, updatedBy: userId, updatedAt: new Date() })
      .where(and(eq(schema.workItemPlacements.organizationId, org), eq(schema.workItemPlacements.workItemId, itemId), eq(schema.workItemPlacements.isOwning, true))).returning();
    return row;
  }

  async joinProject(org: string, userId: string, projectId: string) {
    const [project] = await this.db.select().from(schema.projects).where(and(eq(schema.projects.organizationId, org), eq(schema.projects.id, projectId), isNull(schema.projects.deletedAt))).limit(1);
    if (!project) throw new AppError("NOT_FOUND", "Project not found");
    if (project.privacy === "private" && !(await canAccessProject(this.db, org, projectId, userId))) throw new AppError("FORBIDDEN", "Private projects require an invitation");
    await this.db.insert(schema.projectMembers).values({ organizationId: org, projectId, userId, accessLevel: "editor", createdBy: userId }).onConflictDoNothing();
    return { joined: true };
  }

  async leaveProject(org: string, userId: string, projectId: string) {
    const [project] = await this.db.select({ ownerUserId: schema.projects.ownerUserId }).from(schema.projects).where(and(eq(schema.projects.organizationId, org), eq(schema.projects.id, projectId))).limit(1);
    if (project?.ownerUserId === userId) throw new AppError("VALIDATION", "Project owner cannot leave until ownership is reassigned");
    await this.db.update(schema.projectMembers).set({ deletedAt: new Date(), deletedBy: userId }).where(and(eq(schema.projectMembers.organizationId, org), eq(schema.projectMembers.projectId, projectId), eq(schema.projectMembers.userId, userId), isNull(schema.projectMembers.deletedAt)));
    return { joined: false };
  }

  async projectMembers(org: string, userId: string, projectId: string) {
    if (!(await canAccessProject(this.db, org, projectId, userId))) throw new AppError("FORBIDDEN", "No access to the project");
    return this.db.select({ id: schema.projectMembers.id, userId: schema.projectMembers.userId, displayName: schema.users.displayName, email: schema.users.email, accessLevel: schema.projectMembers.accessLevel, notifyTasks: schema.projectMembers.notifyTasks })
      .from(schema.projectMembers).innerJoin(schema.users, eq(schema.users.id, schema.projectMembers.userId))
      .where(and(eq(schema.projectMembers.organizationId, org), eq(schema.projectMembers.projectId, projectId), isNull(schema.projectMembers.deletedAt))).orderBy(asc(schema.users.displayName));
  }

  async addProjectMember(org: string, actorId: string, projectId: string, memberUserId: string, accessLevel: string) {
    if (!(await canAccessProject(this.db, org, projectId, actorId))) throw new AppError("FORBIDDEN", "No access to the project");
    const [membership] = await this.db.select({ id: schema.organizationMemberships.id }).from(schema.organizationMemberships).where(and(eq(schema.organizationMemberships.organizationId, org), eq(schema.organizationMemberships.userId, memberUserId), eq(schema.organizationMemberships.status, "active"), isNull(schema.organizationMemberships.deletedAt))).limit(1);
    if (!membership) throw new AppError("VALIDATION", "User is not an active workspace member");
    const rows = await this.db.insert(schema.projectMembers).values({ organizationId: org, projectId, userId: memberUserId, accessLevel, createdBy: actorId }).onConflictDoNothing().returning();
    if (rows[0]) return rows[0];
    const [updated] = await this.db.update(schema.projectMembers).set({ accessLevel, deletedAt: null, updatedBy: actorId, updatedAt: new Date() }).where(and(eq(schema.projectMembers.organizationId, org), eq(schema.projectMembers.projectId, projectId), eq(schema.projectMembers.userId, memberUserId))).returning();
    return updated;
  }

  async updateProjectMember(org: string, actorId: string, projectId: string, memberId: string, patch: { accessLevel?: string; notifyTasks?: boolean }) {
    if (!(await canAccessProject(this.db, org, projectId, actorId))) throw new AppError("FORBIDDEN", "No access to the project");
    const [row] = await this.db.update(schema.projectMembers).set({ ...patch, updatedBy: actorId, updatedAt: new Date() }).where(and(eq(schema.projectMembers.id, memberId), eq(schema.projectMembers.organizationId, org), eq(schema.projectMembers.projectId, projectId), isNull(schema.projectMembers.deletedAt))).returning();
    if (!row) throw new AppError("NOT_FOUND", "Project member not found");
    return row;
  }

  async removeProjectMember(org: string, actorId: string, projectId: string, memberId: string) {
    if (!(await canAccessProject(this.db, org, projectId, actorId))) throw new AppError("FORBIDDEN", "No access to the project");
    const [project] = await this.db.select({ ownerUserId: schema.projects.ownerUserId }).from(schema.projects).where(and(eq(schema.projects.id, projectId), eq(schema.projects.organizationId, org))).limit(1);
    const [member] = await this.db.select().from(schema.projectMembers).where(and(eq(schema.projectMembers.id, memberId), eq(schema.projectMembers.organizationId, org), eq(schema.projectMembers.projectId, projectId))).limit(1);
    if (!member) throw new AppError("NOT_FOUND", "Project member not found");
    if (member.userId === project?.ownerUserId) throw new AppError("VALIDATION", "Project owner cannot be removed");
    await this.db.update(schema.projectMembers).set({ deletedAt: new Date(), deletedBy: actorId }).where(eq(schema.projectMembers.id, memberId));
  }

  async favorite(org: string, userId: string, projectId: string, on: boolean) {
    if (!(await canAccessProject(this.db, org, projectId, userId))) throw new AppError("FORBIDDEN", "No access to the project");
    if (on) await this.db.insert(schema.projectFavorites).values({ organizationId: org, userId, projectId }).onConflictDoNothing();
    else await this.db.delete(schema.projectFavorites).where(and(eq(schema.projectFavorites.organizationId, org), eq(schema.projectFavorites.userId, userId), eq(schema.projectFavorites.projectId, projectId)));
    return { favorite: on };
  }

  async favorites(org: string, userId: string) {
    return this.db.select({ projectId: schema.projectFavorites.projectId }).from(schema.projectFavorites).where(and(eq(schema.projectFavorites.organizationId, org), eq(schema.projectFavorites.userId, userId))).orderBy(asc(schema.projectFavorites.rank));
  }

  async statusUpdates(org: string, userId: string, projectId: string) {
    if (!(await canAccessProject(this.db, org, projectId, userId))) throw new AppError("FORBIDDEN", "No access to the project");
    return this.db.select({ id: schema.projectStatusUpdates.id, health: schema.projectStatusUpdates.health, title: schema.projectStatusUpdates.title, body: schema.projectStatusUpdates.body, createdAt: schema.projectStatusUpdates.createdAt, authorUserId: schema.projectStatusUpdates.authorUserId, authorName: schema.users.displayName })
      .from(schema.projectStatusUpdates).innerJoin(schema.users, eq(schema.users.id, schema.projectStatusUpdates.authorUserId))
      .where(and(eq(schema.projectStatusUpdates.organizationId, org), eq(schema.projectStatusUpdates.projectId, projectId))).orderBy(desc(schema.projectStatusUpdates.createdAt)).limit(50);
  }

  async addStatusUpdate(org: string, userId: string, projectId: string, input: { health: string; title: string; body?: string }) {
    if (!(await canAccessProject(this.db, org, projectId, userId))) throw new AppError("FORBIDDEN", "No access to the project");
    return this.db.transaction(async (tx) => {
      const [row] = await tx.insert(schema.projectStatusUpdates).values({ organizationId: org, projectId, authorUserId: userId, health: input.health, title: input.title, body: input.body ?? "" }).returning();
      await tx.update(schema.projects).set({ health: input.health, updatedBy: userId, updatedAt: new Date(), version: sql`${schema.projects.version}+1` }).where(and(eq(schema.projects.id, projectId), eq(schema.projects.organizationId, org)));
      return row;
    });
  }

  async resources(org: string, userId: string, projectId: string) {
    if (!(await canAccessProject(this.db, org, projectId, userId))) throw new AppError("FORBIDDEN", "No access to the project");
    return this.db.select().from(schema.projectResources).where(and(eq(schema.projectResources.organizationId, org), eq(schema.projectResources.projectId, projectId))).orderBy(asc(schema.projectResources.rank), asc(schema.projectResources.createdAt));
  }

  async addResource(org: string, userId: string, projectId: string, input: { kind?: string; name: string; url?: string; body?: string }) {
    if (!(await canAccessProject(this.db, org, projectId, userId))) throw new AppError("FORBIDDEN", "No access to the project");
    const [{ max }] = await this.db.select({ max: sql<number>`coalesce(max(${schema.projectResources.rank}),-1)::int` }).from(schema.projectResources).where(and(eq(schema.projectResources.organizationId, org), eq(schema.projectResources.projectId, projectId)));
    const [row] = await this.db.insert(schema.projectResources).values({ organizationId: org, projectId, kind: input.kind ?? "link", name: input.name, url: input.url, body: input.body, rank: Number(max ?? -1) + 1, createdBy: userId }).returning();
    return row;
  }

  async removeResource(org: string, userId: string, projectId: string, resourceId: string) {
    if (!(await canAccessProject(this.db, org, projectId, userId))) throw new AppError("FORBIDDEN", "No access to the project");
    await this.db.delete(schema.projectResources).where(and(eq(schema.projectResources.id, resourceId), eq(schema.projectResources.organizationId, org), eq(schema.projectResources.projectId, projectId)));
  }

  async workItemContext(org: string, userId: string, itemId: string) {
    if (!(await canAccessWorkItem(this.db, org, itemId, userId))) throw new AppError("FORBIDDEN", "No access to the work item");
    const [placements, watchers, likes] = await Promise.all([
      this.db.select({ id: schema.workItemPlacements.id, projectId: schema.workItemPlacements.projectId, projectName: schema.projects.name, color: schema.projects.color, isOwning: schema.workItemPlacements.isOwning, sectionId: schema.workItemPlacements.sectionId })
        .from(schema.workItemPlacements).innerJoin(schema.projects, eq(schema.projects.id, schema.workItemPlacements.projectId))
        .where(and(eq(schema.workItemPlacements.organizationId, org), eq(schema.workItemPlacements.workItemId, itemId), isNull(schema.workItemPlacements.deletedAt))),
      this.db.select({ userId: schema.workItemWatchers.userId, displayName: schema.users.displayName, email: schema.users.email })
        .from(schema.workItemWatchers).innerJoin(schema.users, eq(schema.users.id, schema.workItemWatchers.userId))
        .where(and(eq(schema.workItemWatchers.organizationId, org), eq(schema.workItemWatchers.workItemId, itemId))),
      this.db.select({ userId: schema.workItemLikes.userId }).from(schema.workItemLikes).where(and(eq(schema.workItemLikes.organizationId, org), eq(schema.workItemLikes.workItemId, itemId))),
    ]);
    return { placements, collaborators: watchers, liked: likes.some((row) => row.userId === userId), likeCount: likes.length };
  }

  async setCollaborator(org: string, actorId: string, itemId: string, memberUserId: string, on: boolean) {
    if (!(await canAccessWorkItem(this.db, org, itemId, actorId))) throw new AppError("FORBIDDEN", "No access to the work item");
    if (on) {
      const [m] = await this.db.select({ id: schema.organizationMemberships.id }).from(schema.organizationMemberships).where(and(eq(schema.organizationMemberships.organizationId, org), eq(schema.organizationMemberships.userId, memberUserId), eq(schema.organizationMemberships.status, "active"), isNull(schema.organizationMemberships.deletedAt))).limit(1);
      if (!m) throw new AppError("VALIDATION", "Collaborator must be an active workspace member");
      await this.db.insert(schema.workItemWatchers).values({ organizationId: org, workItemId: itemId, userId: memberUserId }).onConflictDoNothing();
    } else await this.db.delete(schema.workItemWatchers).where(and(eq(schema.workItemWatchers.organizationId, org), eq(schema.workItemWatchers.workItemId, itemId), eq(schema.workItemWatchers.userId, memberUserId)));
    return { ok: true };
  }

  async setLike(org: string, userId: string, itemId: string, on: boolean) {
    if (!(await canAccessWorkItem(this.db, org, itemId, userId))) throw new AppError("FORBIDDEN", "No access to the work item");
    if (on) await this.db.insert(schema.workItemLikes).values({ organizationId: org, workItemId: itemId, userId }).onConflictDoNothing();
    else await this.db.delete(schema.workItemLikes).where(and(eq(schema.workItemLikes.organizationId, org), eq(schema.workItemLikes.workItemId, itemId), eq(schema.workItemLikes.userId, userId)));
    const [{ n }] = await this.db.select({ n: count() }).from(schema.workItemLikes).where(and(eq(schema.workItemLikes.organizationId, org), eq(schema.workItemLikes.workItemId, itemId)));
    return { liked: on, likeCount: Number(n) };
  }

  async setPublic(org: string, userId: string, itemId: string, isPublic: boolean) {
    if (!(await canAccessWorkItem(this.db, org, itemId, userId))) throw new AppError("FORBIDDEN", "No access to the work item");
    const [row] = await this.db.update(schema.workItems).set({ publicToOrganization: isPublic, updatedBy: userId, updatedAt: new Date(), version: sql`${schema.workItems.version}+1` }).where(and(eq(schema.workItems.id, itemId), eq(schema.workItems.organizationId, org), isNull(schema.workItems.deletedAt))).returning();
    return row;
  }

  async convertType(org: string, userId: string, itemId: string, typeKey: string) {
    if (!(await canAccessWorkItem(this.db, org, itemId, userId))) throw new AppError("FORBIDDEN", "No access to the work item");
    if (!['task','milestone','approval'].includes(typeKey)) throw new AppError("VALIDATION", "Use Demote to convert a task into a subtask");
    const [type] = await this.db.select({ id: schema.workItemTypes.id }).from(schema.workItemTypes).where(and(eq(schema.workItemTypes.organizationId, org), eq(schema.workItemTypes.key, typeKey), isNull(schema.workItemTypes.deletedAt))).limit(1);
    if (!type) throw new AppError("NOT_FOUND", "Work item type is not enabled");
    const [row] = await this.db.update(schema.workItems).set({ typeId: type.id, parentId: null, updatedBy: userId, updatedAt: new Date(), version: sql`${schema.workItems.version}+1` }).where(and(eq(schema.workItems.id, itemId), eq(schema.workItems.organizationId, org), isNull(schema.workItems.deletedAt))).returning();
    await this.db.insert(schema.activityEvents).values({ organizationId: org, workItemId: itemId, projectId: row.owningProjectId, actorUserId: userId, action: "work_item.converted", data: typeKey });
    return row;
  }

  async createFollowUp(org: string, userId: string, itemId: string) {
    if (!(await canAccessWorkItem(this.db, org, itemId, userId))) throw new AppError("FORBIDDEN", "No access to the work item");
    const source = await this.workItems.get(org, itemId);
    const followUp = await this.workItems.create(org, userId, { projectId: source.owningProjectId, title: `Follow up: ${source.title}`, description: `Follow-up for ${source.key}`, priority: source.priority as any, primaryOwnerUserId: userId });
    await this.db.insert(schema.activityEvents).values({ organizationId: org, workItemId: itemId, projectId: source.owningProjectId, actorUserId: userId, action: "work_item.follow_up_created", data: followUp.key });
    return followUp;
  }

  async mergeDuplicate(org: string, userId: string, duplicateId: string, targetId: string) {
    if (duplicateId === targetId) throw new AppError("VALIDATION", "Choose another task to merge into");
    if (!(await canAccessWorkItem(this.db, org, duplicateId, userId)) || !(await canAccessWorkItem(this.db, org, targetId, userId))) throw new AppError("FORBIDDEN", "No access to one of the tasks");
    const [source, target] = await Promise.all([this.workItems.get(org, duplicateId), this.workItems.get(org, targetId)]);
    if (source.owningProjectId !== target.owningProjectId) throw new AppError("VALIDATION", "Duplicate merge currently requires the same owning project");
    await this.db.transaction(async (tx) => {
      const watchers = await tx.select({ userId: schema.workItemWatchers.userId }).from(schema.workItemWatchers).where(and(eq(schema.workItemWatchers.organizationId, org), eq(schema.workItemWatchers.workItemId, duplicateId)));
      for (const w of watchers) await tx.insert(schema.workItemWatchers).values({ organizationId: org, workItemId: targetId, userId: w.userId }).onConflictDoNothing();
      const tags = await tx.select({ tagId: schema.workItemTags.tagId }).from(schema.workItemTags).where(eq(schema.workItemTags.workItemId, duplicateId));
      for (const tag of tags) await tx.insert(schema.workItemTags).values({ workItemId: targetId, tagId: tag.tagId }).onConflictDoNothing();
      await tx.update(schema.comments).set({ workItemId: targetId, updatedBy: userId, updatedAt: new Date() }).where(and(eq(schema.comments.organizationId, org), eq(schema.comments.workItemId, duplicateId)));
      await tx.update(schema.attachments).set({ workItemId: targetId, updatedBy: userId, updatedAt: new Date() }).where(and(eq(schema.attachments.organizationId, org), eq(schema.attachments.workItemId, duplicateId)));
      await tx.update(schema.workItems).set({ status: "Done", statusCategory: "done", deletedAt: new Date(), deletedBy: userId, updatedBy: userId, updatedAt: new Date() }).where(and(eq(schema.workItems.organizationId, org), eq(schema.workItems.id, duplicateId)));
      await tx.insert(schema.activityEvents).values([{ organizationId: org, workItemId: targetId, projectId: target.owningProjectId, actorUserId: userId, action: "work_item.duplicate_merged", data: source.key }, { organizationId: org, workItemId: duplicateId, projectId: source.owningProjectId, actorUserId: userId, action: "work_item.merged_into", data: target.key }]);
    });
    return { targetId, mergedId: duplicateId };
  }

  async projectBrief(org: string, userId: string, projectId: string) {
    if (!(await canAccessProject(this.db, org, projectId, userId))) throw new AppError("FORBIDDEN", "No access to the project");
    const [row] = await this.db.select().from(schema.projectResources).where(and(eq(schema.projectResources.organizationId, org), eq(schema.projectResources.projectId, projectId), eq(schema.projectResources.kind, "brief"))).orderBy(desc(schema.projectResources.createdAt)).limit(1);
    return row ?? { id: null, projectId, kind: "brief", name: "Project brief", body: "" };
  }

  async saveProjectBrief(org: string, userId: string, projectId: string, body: string) {
    if (!(await canAccessProject(this.db, org, projectId, userId))) throw new AppError("FORBIDDEN", "No access to the project");
    const [existing] = await this.db.select().from(schema.projectResources).where(and(eq(schema.projectResources.organizationId, org), eq(schema.projectResources.projectId, projectId), eq(schema.projectResources.kind, "brief"))).limit(1);
    if (existing) {
      const [row] = await this.db.update(schema.projectResources).set({ body, name: "Project brief" }).where(eq(schema.projectResources.id, existing.id)).returning();
      await this.db.insert(schema.activityEvents).values({ organizationId: org, projectId, actorUserId: userId, action: "project.brief_updated", data: "Project brief updated" });
      return row;
    }
    const [row] = await this.db.insert(schema.projectResources).values({ organizationId: org, projectId, kind: "brief", name: "Project brief", body, createdBy: userId }).returning();
    await this.db.insert(schema.activityEvents).values({ organizationId: org, projectId, actorUserId: userId, action: "project.brief_created", data: "Project brief created" });
    return row;
  }

  async projectActivityTimeline(org: string, userId: string, projectId: string) {
    if (!(await canAccessProject(this.db, org, projectId, userId))) throw new AppError("FORBIDDEN", "No access to the project");
    const [activity, statuses, resources] = await Promise.all([
      this.db.select({ id: schema.activityEvents.id, kind: schema.activityEvents.action, text: schema.activityEvents.data, at: schema.activityEvents.createdAt, actorUserId: schema.activityEvents.actorUserId }).from(schema.activityEvents).where(and(eq(schema.activityEvents.organizationId, org), eq(schema.activityEvents.projectId, projectId))).orderBy(desc(schema.activityEvents.createdAt)).limit(80),
      this.db.select({ id: schema.projectStatusUpdates.id, kind: sql<string>`'project.status'`, text: schema.projectStatusUpdates.title, at: schema.projectStatusUpdates.createdAt, actorUserId: schema.projectStatusUpdates.authorUserId }).from(schema.projectStatusUpdates).where(and(eq(schema.projectStatusUpdates.organizationId, org), eq(schema.projectStatusUpdates.projectId, projectId))).orderBy(desc(schema.projectStatusUpdates.createdAt)).limit(30),
      this.db.select({ id: schema.projectResources.id, kind: sql<string>`'project.resource'`, text: schema.projectResources.name, at: schema.projectResources.createdAt, actorUserId: schema.projectResources.createdBy }).from(schema.projectResources).where(and(eq(schema.projectResources.organizationId, org), eq(schema.projectResources.projectId, projectId))).orderBy(desc(schema.projectResources.createdAt)).limit(30),
    ]);
    const rows = [...activity, ...statuses, ...resources].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime()).slice(0, 100);
    const actorIds = Array.from(new Set(rows.map((r) => r.actorUserId).filter(Boolean))) as string[];
    const actors = actorIds.length ? await this.db.select({ id: schema.users.id, displayName: schema.users.displayName }).from(schema.users).where(inArray(schema.users.id, actorIds)) : [];
    const names = new Map(actors.map((a) => [a.id, a.displayName]));
    return rows.map((r) => ({ ...r, actorName: r.actorUserId ? names.get(r.actorUserId) ?? "Former member" : "System" }));
  }

  async projectListMetadata(org: string, userId: string, projectId: string) {
    if (!(await canAccessProject(this.db, org, projectId, userId))) throw new AppError("FORBIDDEN", "No access to the project");
    const ids = (await this.db.select({ id: schema.workItemPlacements.workItemId }).from(schema.workItemPlacements).where(and(eq(schema.workItemPlacements.organizationId, org), eq(schema.workItemPlacements.projectId, projectId), isNull(schema.workItemPlacements.deletedAt)))).map(r=>r.id);
    if (!ids.length) return {};
    const [tagRows, attachmentRows, watcherRows, timeRows, depPred, depSucc, completedRows, likeRows] = await Promise.all([
      this.db.select({ workItemId: schema.workItemTags.workItemId, name: schema.tags.name }).from(schema.workItemTags).innerJoin(schema.tags, eq(schema.tags.id, schema.workItemTags.tagId)).where(inArray(schema.workItemTags.workItemId, ids)),
      this.db.select({ workItemId: schema.attachments.workItemId, n: count() }).from(schema.attachments).where(and(eq(schema.attachments.organizationId, org), inArray(schema.attachments.workItemId, ids), isNull(schema.attachments.deletedAt))).groupBy(schema.attachments.workItemId),
      this.db.select({ workItemId: schema.workItemWatchers.workItemId, n: count() }).from(schema.workItemWatchers).where(and(eq(schema.workItemWatchers.organizationId, org), inArray(schema.workItemWatchers.workItemId, ids))).groupBy(schema.workItemWatchers.workItemId),
      this.db.select({ workItemId: schema.timeEntries.workItemId, minutes: sql<number>`coalesce(sum(${schema.timeEntries.minutes}),0)::int` }).from(schema.timeEntries).where(and(eq(schema.timeEntries.organizationId, org), inArray(schema.timeEntries.workItemId, ids))).groupBy(schema.timeEntries.workItemId),
      this.db.select({ workItemId: schema.workItemDependencies.predecessorId, n: count() }).from(schema.workItemDependencies).where(and(eq(schema.workItemDependencies.organizationId, org), inArray(schema.workItemDependencies.predecessorId, ids), isNull(schema.workItemDependencies.deletedAt))).groupBy(schema.workItemDependencies.predecessorId),
      this.db.select({ workItemId: schema.workItemDependencies.successorId, n: count() }).from(schema.workItemDependencies).where(and(eq(schema.workItemDependencies.organizationId, org), inArray(schema.workItemDependencies.successorId, ids), isNull(schema.workItemDependencies.deletedAt))).groupBy(schema.workItemDependencies.successorId),
      this.db.select({ workItemId: schema.workItemStatusHistory.workItemId, at: sql<Date>`max(${schema.workItemStatusHistory.at})` }).from(schema.workItemStatusHistory).where(and(eq(schema.workItemStatusHistory.organizationId, org), inArray(schema.workItemStatusHistory.workItemId, ids), eq(schema.workItemStatusHistory.toCategory, "done"))).groupBy(schema.workItemStatusHistory.workItemId),
      this.db.select({ workItemId: schema.workItemLikes.workItemId, n: count() }).from(schema.workItemLikes).where(and(eq(schema.workItemLikes.organizationId, org), inArray(schema.workItemLikes.workItemId, ids))).groupBy(schema.workItemLikes.workItemId),
    ]);
    const out: Record<string, any> = Object.fromEntries(ids.map(id=>[id,{tags:[],attachments:0,collaborators:0,actualMinutes:0,blocking:0,blockedBy:0,likes:0,completedAt:null}]));
    for(const r of tagRows) out[r.workItemId]?.tags.push(r.name);
    for(const r of attachmentRows) if(out[r.workItemId]) out[r.workItemId].attachments=Number(r.n);
    for(const r of watcherRows) if(out[r.workItemId]) out[r.workItemId].collaborators=Number(r.n);
    for(const r of timeRows) if(r.workItemId&&out[r.workItemId]) out[r.workItemId].actualMinutes=Number(r.minutes);
    for(const r of depPred) if(out[r.workItemId]) out[r.workItemId].blocking=Number(r.n);
    for(const r of depSucc) if(out[r.workItemId]) out[r.workItemId].blockedBy=Number(r.n);
    for(const r of completedRows) if(out[r.workItemId]) out[r.workItemId].completedAt=r.at;
    for(const r of likeRows) if(out[r.workItemId]) out[r.workItemId].likes=Number(r.n);
    return out;
  }

  async projectMessages(org: string, userId: string, projectId: string) {
    if (!(await canAccessProject(this.db, org, projectId, userId))) throw new AppError("FORBIDDEN", "No access to the project");
    return this.db.select({ id: schema.projectMessages.id, subject: schema.projectMessages.subject, body: schema.projectMessages.body, pinned: schema.projectMessages.pinned, createdAt: schema.projectMessages.createdAt, authorUserId: schema.projectMessages.authorUserId, authorName: schema.users.displayName })
      .from(schema.projectMessages).innerJoin(schema.users, eq(schema.users.id, schema.projectMessages.authorUserId))
      .where(and(eq(schema.projectMessages.organizationId, org), eq(schema.projectMessages.projectId, projectId))).orderBy(desc(schema.projectMessages.pinned), desc(schema.projectMessages.createdAt));
  }

  async addProjectMessage(org: string, userId: string, projectId: string, input: { subject: string; body?: string; pinned?: boolean }) {
    if (!(await canAccessProject(this.db, org, projectId, userId))) throw new AppError("FORBIDDEN", "No access to the project");
    const [row] = await this.db.insert(schema.projectMessages).values({ organizationId: org, projectId, authorUserId: userId, subject: input.subject.trim(), body: input.body?.trim() ?? "", pinned: input.pinned ?? false }).returning();
    return row;
  }

  async updateProjectMessage(org: string, userId: string, projectId: string, messageId: string, patch: { pinned?: boolean; subject?: string; body?: string }) {
    if (!(await canAccessProject(this.db, org, projectId, userId))) throw new AppError("FORBIDDEN", "No access to the project");
    const [row] = await this.db.update(schema.projectMessages).set({ ...patch, updatedAt: new Date() }).where(and(eq(schema.projectMessages.id, messageId), eq(schema.projectMessages.organizationId, org), eq(schema.projectMessages.projectId, projectId))).returning();
    if (!row) throw new AppError("NOT_FOUND", "Message not found");
    return row;
  }

  async projectFiles(org: string, userId: string, projectId: string) {
    if (!(await canAccessProject(this.db, org, projectId, userId))) throw new AppError("FORBIDDEN", "No access to the project");
    return this.db.select({ id: schema.attachments.id, filename: schema.attachments.filename, currentVersionId: schema.attachments.currentVersionId, createdAt: schema.attachments.createdAt, createdBy: schema.attachments.createdBy, workItemId: schema.workItems.id, workItemKey: schema.workItems.key, workItemTitle: schema.workItems.title, contentType: schema.attachmentVersions.contentType, bytes: schema.attachmentVersions.bytes })
      .from(schema.attachments).innerJoin(schema.workItems, eq(schema.workItems.id, schema.attachments.workItemId))
      .leftJoin(schema.attachmentVersions, eq(schema.attachmentVersions.id, schema.attachments.currentVersionId))
      .where(and(eq(schema.attachments.organizationId, org), eq(schema.workItems.owningProjectId, projectId), isNull(schema.attachments.deletedAt), isNull(schema.workItems.deletedAt))).orderBy(desc(schema.attachments.createdAt));
  }

  async myFiles(org: string, userId: string) {
    const assignedIds = (await this.db.select({ id: schema.workItemAssignees.workItemId }).from(schema.workItemAssignees).where(and(eq(schema.workItemAssignees.organizationId, org), eq(schema.workItemAssignees.userId, userId)))).map((r) => r.id);
    const items = await this.db.select({ id: schema.workItems.id }).from(schema.workItems).where(and(eq(schema.workItems.organizationId, org), isNull(schema.workItems.deletedAt), or(eq(schema.workItems.primaryOwnerUserId, userId), assignedIds.length ? inArray(schema.workItems.id, assignedIds) : eq(schema.workItems.primaryOwnerUserId, userId))));
    const visible: string[] = [];
    for (const item of items) if (await canAccessWorkItem(this.db, org, item.id, userId)) visible.push(item.id);
    if (!visible.length) return [];
    return this.db.select({ id: schema.attachments.id, filename: schema.attachments.filename, currentVersionId: schema.attachments.currentVersionId, createdAt: schema.attachments.createdAt, workItemId: schema.workItems.id, workItemKey: schema.workItems.key, workItemTitle: schema.workItems.title, projectId: schema.workItems.owningProjectId, contentType: schema.attachmentVersions.contentType, bytes: schema.attachmentVersions.bytes })
      .from(schema.attachments).innerJoin(schema.workItems, eq(schema.workItems.id, schema.attachments.workItemId)).leftJoin(schema.attachmentVersions, eq(schema.attachmentVersions.id, schema.attachments.currentVersionId))
      .where(and(eq(schema.attachments.organizationId, org), inArray(schema.attachments.workItemId, visible), isNull(schema.attachments.deletedAt))).orderBy(desc(schema.attachments.createdAt));
  }
}
