import { Injectable, Inject } from "@nestjs/common";
import { and, eq, sql, gte } from "drizzle-orm";
import { schema, type Database } from "@pm/db";
import { AppError } from "@pm/shared";
import { DB } from "../db/db.module.js";
import { OPTIONAL_MODULES } from "../modules/optional-modules.js";

const CHECKLIST_ADMIN = ["invite_teammate", "create_project", "create_task", "customize_field", "enable_module"] as const;
const CHECKLIST_MEMBER = ["complete_profile", "create_task", "comment_on_task", "customize_my_tasks"] as const;

@Injectable()
export class OnboardingService {
  constructor(@Inject(DB) private readonly db: Database) {}

  // ---- I.2.1.4 per-role progress checklist ----

  async progress(organizationId: string, userId: string) {
    const [adminRole] = await this.db.select({ id: schema.userRoleAssignments.id }).from(schema.userRoleAssignments)
      .where(and(eq(schema.userRoleAssignments.organizationId, organizationId), eq(schema.userRoleAssignments.userId, userId), eq(schema.userRoleAssignments.roleKey, "organization_admin"))).limit(1);
    const isAdmin = Boolean(adminRole);
    const [row] = await this.db.select().from(schema.onboardingProgress)
      .where(and(eq(schema.onboardingProgress.organizationId, organizationId), eq(schema.onboardingProgress.userId, userId))).limit(1);
    const items = (row?.items ?? {}) as Record<string, string>;
    const checklist = isAdmin ? CHECKLIST_ADMIN : CHECKLIST_MEMBER;
    return {
      isAdmin,
      dismissed: row?.dismissed ?? false,
      items: checklist.map((key) => ({ key, done: Boolean(items[key]), doneAt: items[key] ?? null })),
      completedCount: checklist.filter((key) => items[key]).length,
      totalCount: checklist.length,
    };
  }

  async markItemDone(organizationId: string, userId: string, itemKey: string) {
    const [existing] = await this.db.select({ items: schema.onboardingProgress.items }).from(schema.onboardingProgress)
      .where(and(eq(schema.onboardingProgress.organizationId, organizationId), eq(schema.onboardingProgress.userId, userId))).limit(1);
    const items = { ...(existing?.items as Record<string, string> ?? {}), [itemKey]: new Date().toISOString() };
    await this.db.insert(schema.onboardingProgress).values({ organizationId, userId, items })
      .onConflictDoUpdate({ target: [schema.onboardingProgress.organizationId, schema.onboardingProgress.userId], set: { items, updatedAt: new Date() } });
    return { ok: true };
  }

  async dismissChecklist(organizationId: string, userId: string) {
    await this.db.insert(schema.onboardingProgress).values({ organizationId, userId, dismissed: true })
      .onConflictDoUpdate({ target: [schema.onboardingProgress.organizationId, schema.onboardingProgress.userId], set: { dismissed: true, updatedAt: new Date() } });
    return { ok: true };
  }

  // ---- I.2.1.3 sample data ----

  /** Creates one sample project with a few sample tasks, explicitly flagged and excluded from real analytics. */
  async createSampleData(organizationId: string, userId: string) {
    const [workspace] = await this.db.select({ id: schema.workspaces.id }).from(schema.workspaces).where(eq(schema.workspaces.organizationId, organizationId)).limit(1);
    if (!workspace) throw new AppError("VALIDATION", "No workspace configured for this organization");
    const [taskType] = await this.db.select({ id: schema.workItemTypes.id }).from(schema.workItemTypes)
      .where(and(eq(schema.workItemTypes.organizationId, organizationId), eq(schema.workItemTypes.key, "task"))).limit(1);
    if (!taskType) throw new AppError("VALIDATION", "No 'task' work item type configured for this organization");
    const [project] = await this.db.insert(schema.projects).values({
      organizationId, workspaceId: workspace.id, keyPrefix: "SAMP", name: "Sample: Launch a marketing campaign",
      description: "A sample project so you can see how PM works before adding real projects. Remove it any time.",
      ownerUserId: userId, isSample: true, createdBy: userId,
    }).returning();
    const sampleTasks = ["Define campaign goals", "Draft creative brief", "Schedule launch review"];
    for (const title of sampleTasks) {
      await this.db.insert(schema.workItems).values({
        organizationId, workspaceId: workspace.id, owningProjectId: project.id, typeId: taskType.id, key: `SAMP-${sampleTasks.indexOf(title) + 1}`,
        title, reporterUserId: userId, primaryOwnerUserId: userId, createdBy: userId,
      });
    }
    return { projectId: project.id, tasksCreated: sampleTasks.length };
  }

  /** One-click removal — hard delete since sample data was never real. */
  async removeSampleData(organizationId: string) {
    const samples = await this.db.select({ id: schema.projects.id }).from(schema.projects)
      .where(and(eq(schema.projects.organizationId, organizationId), eq(schema.projects.isSample, true)));
    for (const p of samples) {
      await this.db.delete(schema.workItems).where(eq(schema.workItems.owningProjectId, p.id));
      await this.db.delete(schema.projects).where(eq(schema.projects.id, p.id));
    }
    return { removed: samples.length };
  }

  // ---- I.2.2.2 feature spotlight ----

  async unseenSpotlights(organizationId: string, userId: string, keys: string[]) {
    const seen = await this.db.select({ spotlightKey: schema.featureSpotlightsSeen.spotlightKey }).from(schema.featureSpotlightsSeen)
      .where(and(eq(schema.featureSpotlightsSeen.organizationId, organizationId), eq(schema.featureSpotlightsSeen.userId, userId)));
    const seenKeys = new Set(seen.map((s) => s.spotlightKey));
    return keys.filter((k) => !seenKeys.has(k));
  }

  async markSpotlightSeen(organizationId: string, userId: string, spotlightKey: string, permanent: boolean) {
    await this.db.insert(schema.featureSpotlightsSeen).values({ organizationId, userId, spotlightKey, dismissedPermanently: permanent })
      .onConflictDoUpdate({ target: [schema.featureSpotlightsSeen.organizationId, schema.featureSpotlightsSeen.userId, schema.featureSpotlightsSeen.spotlightKey], set: { seenAt: new Date(), dismissedPermanently: permanent } });
    return { ok: true };
  }

  // ---- I.2.4 adoption analytics ----

  /** Fire-and-forget usage counter. Never records content — only that a feature fired. */
  async recordUsage(organizationId: string, userId: string, feature: string) {
    const today = new Date().toISOString().slice(0, 10);
    await this.db.insert(schema.featureUsageEvents).values({ organizationId, userId, feature, occurredOn: today }).catch(() => {});
  }

  /** I.2.4.1 — activation funnel: invite -> login -> create -> complete, by distinct user count. */
  async activationFunnel(organizationId: string) {
    const steps = ["invited", "logged_in", "created_work_item", "completed_work_item"];
    const counts: Record<string, number> = {};
    for (const step of steps) {
      const [{ n }] = await this.db.select({ n: sql<number>`count(distinct ${schema.featureUsageEvents.userId})::int` })
        .from(schema.featureUsageEvents).where(and(eq(schema.featureUsageEvents.organizationId, organizationId), eq(schema.featureUsageEvents.feature, step)));
      counts[step] = Number(n);
    }
    return counts;
  }

  /** I.2.4.2 — modules that are enabled but show zero usage in the last 30 days. */
  async unusedModulesReport(organizationId: string) {
    const cutoff = new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10);
    const enabled = await this.db.select({ key: schema.featureFlags.key }).from(schema.featureFlags)
      .where(and(eq(schema.featureFlags.organizationId, organizationId), eq(schema.featureFlags.enabled, true)));
    const enabledModules = enabled.map((e) => e.key.replace(/^module:/, "")).filter((k) => (OPTIONAL_MODULES as readonly string[]).includes(k));
    const used = await this.db.select({ feature: schema.featureUsageEvents.feature }).from(schema.featureUsageEvents)
      .where(and(eq(schema.featureUsageEvents.organizationId, organizationId), gte(schema.featureUsageEvents.occurredOn, cutoff)));
    const usedModules = new Set(used.map((u) => u.feature.replace(/^module:/, "")));
    return enabledModules.filter((m) => !usedModules.has(m)).map((m) => ({ module: m, lastUsed: null as string | null }));
  }

  // ---- I.2.4.3 telemetry ----

  async telemetrySettings(organizationId: string) {
    const rows = await this.db.select().from(schema.telemetrySettings).where(eq(schema.telemetrySettings.organizationId, organizationId));
    const categories = ["usage", "performance", "errors"];
    return categories.map((c) => ({ category: c, enabled: rows.find((r) => r.category === c)?.enabled ?? false }));
  }

  async setTelemetry(organizationId: string, userId: string, category: string, enabled: boolean) {
    if (!["usage", "performance", "errors"].includes(category)) throw new AppError("VALIDATION", "Unknown telemetry category");
    await this.db.insert(schema.telemetrySettings).values({ organizationId, category, enabled, updatedByUserId: userId })
      .onConflictDoUpdate({ target: [schema.telemetrySettings.organizationId, schema.telemetrySettings.category], set: { enabled, updatedAt: new Date(), updatedByUserId: userId } });
    return { ok: true };
  }
}
