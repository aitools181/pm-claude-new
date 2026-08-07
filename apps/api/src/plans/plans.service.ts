import { Injectable, Inject } from "@nestjs/common";
import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { schema, type Database } from "@pm/db";
import { AppError } from "@pm/shared";
import { DB } from "../db/db.module.js";
import { OPTIONAL_MODULES, type OptionalModule } from "../modules/optional-modules.js";

export type PlanLimits = { maxMembers?: number | null; maxProjects?: number | null; maxWorkItems?: number | null };
const LIMIT_KEYS = ["maxMembers", "maxProjects", "maxWorkItems"] as const;
export const DEFAULT_PLAN_KEY = "free";

/** Shipped catalogue; prices are editable from the platform console. */
const SEED_PLANS = [
  { key: "free", name: "Free", description: "Get started with core project management.", priceMonthly: 0, priceYearly: 0, sortOrder: 1,
    limits: { maxMembers: 5, maxProjects: 3, maxWorkItems: 500 }, modules: [] as string[] },
  { key: "pro", name: "Pro", description: "For growing teams that need reporting and automation.", priceMonthly: 49900, priceYearly: 499000, sortOrder: 2,
    limits: { maxMembers: 50, maxProjects: 50, maxWorkItems: 50000 }, modules: ["chat", "whiteboard", "calculations", "scenarios"] },
  { key: "business", name: "Business", description: "Advanced planning, service desk and integrations.", priceMonthly: 99900, priceYearly: 999000, sortOrder: 3,
    limits: { maxMembers: 250, maxProjects: null, maxWorkItems: null }, modules: ["chat", "whiteboard", "calculations", "scenarios", "ai", "service_management", "connected_search", "devops", "communications", "productivity"] },
  { key: "enterprise", name: "Enterprise", description: "Unlimited scale with enterprise identity and governance.", priceMonthly: 0, priceYearly: 0, sortOrder: 4,
    limits: { maxMembers: null, maxProjects: null, maxWorkItems: null }, modules: [...OPTIONAL_MODULES] as string[] },
];

@Injectable()
export class PlansService {
  constructor(@Inject(DB) private readonly db: Database) {}

  /** Idempotent: installs the shipped catalogue without overwriting edited prices. */
  async seedDefaults(userId?: string) {
    for (const p of SEED_PLANS) {
      const [existing] = await this.db.select().from(schema.plans).where(eq(schema.plans.key, p.key)).limit(1);
      if (existing) continue;
      await this.db.insert(schema.plans).values({ ...p, currency: "INR", isPublic: true, status: "active", updatedByUserId: userId ?? null });
    }
    return this.list();
  }

  list(includeRetired = true) {
    const q = this.db.select().from(schema.plans).orderBy(asc(schema.plans.sortOrder));
    return includeRetired ? q : this.db.select().from(schema.plans).where(eq(schema.plans.status, "active")).orderBy(asc(schema.plans.sortOrder));
  }
  /** Pricing page: only public, active tiers. */
  publicPlans() {
    return this.db.select({ key: schema.plans.key, name: schema.plans.name, description: schema.plans.description, currency: schema.plans.currency, priceMonthly: schema.plans.priceMonthly, priceYearly: schema.plans.priceYearly, limits: schema.plans.limits, modules: schema.plans.modules, sortOrder: schema.plans.sortOrder })
      .from(schema.plans).where(and(eq(schema.plans.status, "active"), eq(schema.plans.isPublic, true))).orderBy(asc(schema.plans.sortOrder));
  }

  private validate(input: { priceMonthly?: number; priceYearly?: number; modules?: string[]; limits?: PlanLimits }) {
    for (const f of ["priceMonthly", "priceYearly"] as const) {
      const v = input[f];
      if (v !== undefined && (!Number.isInteger(v) || v < 0)) throw new AppError("VALIDATION", `${f} must be a whole number of minor units (0 or more)`);
    }
    for (const m of input.modules ?? []) if (!OPTIONAL_MODULES.includes(m as OptionalModule)) throw new AppError("VALIDATION", `Unknown module '${m}'`);
    for (const [k, v] of Object.entries(input.limits ?? {})) {
      if (!LIMIT_KEYS.includes(k as (typeof LIMIT_KEYS)[number])) throw new AppError("VALIDATION", `Unknown limit '${k}'`);
      if (v !== null && v !== undefined && (!Number.isInteger(v) || (v as number) < 0)) throw new AppError("VALIDATION", `Limit '${k}' must be a whole number or null for unlimited`);
    }
  }

  async createPlan(userId: string, input: { key: string; name: string; description?: string; currency?: string; priceMonthly: number; priceYearly: number; limits?: PlanLimits; modules?: string[]; isPublic?: boolean; sortOrder?: number }) {
    this.validate(input);
    const key = input.key.trim().toLowerCase().replace(/[^a-z0-9_-]/g, "");
    if (!key) throw new AppError("VALIDATION", "A plan key is required");
    const [clash] = await this.db.select().from(schema.plans).where(eq(schema.plans.key, key)).limit(1);
    if (clash) throw new AppError("CONFLICT", "A plan with that key already exists");
    const [row] = await this.db.insert(schema.plans).values({
      key, name: input.name, description: input.description, currency: input.currency ?? "INR",
      priceMonthly: input.priceMonthly, priceYearly: input.priceYearly,
      limits: input.limits ?? {}, modules: input.modules ?? [], isPublic: input.isPublic ?? true, sortOrder: input.sortOrder ?? 0,
      updatedByUserId: userId,
    }).returning();
    return row;
  }

  async updatePlan(userId: string, key: string, patch: Partial<{ name: string; description: string; currency: string; priceMonthly: number; priceYearly: number; limits: PlanLimits; modules: string[]; isPublic: boolean; sortOrder: number; status: string }>) {
    this.validate(patch);
    if (patch.status && !["active", "retired"].includes(patch.status)) throw new AppError("VALIDATION", "Status must be active or retired");
    const [existing] = await this.db.select().from(schema.plans).where(eq(schema.plans.key, key)).limit(1);
    if (!existing) throw new AppError("NOT_FOUND", "Plan not found");
    const [row] = await this.db.update(schema.plans).set({ ...patch, updatedByUserId: userId, updatedAt: new Date() }).where(eq(schema.plans.id, existing.id)).returning();
    return row;
  }

  /** Retiring hides a plan from pricing but never strips organizations already on it. */
  async retirePlan(userId: string, key: string) { return this.updatePlan(userId, key, { status: "retired", isPublic: false }); }

  // ---- subscriptions ----
  async assignPlan(actorUserId: string, organizationId: string, planKey: string, opts: { seats?: number | null; status?: string; currentPeriodEnd?: Date | null } = {}) {
    const [plan] = await this.db.select().from(schema.plans).where(eq(schema.plans.key, planKey)).limit(1);
    if (!plan) throw new AppError("NOT_FOUND", "Plan not found");
    const [org] = await this.db.select().from(schema.organizations).where(eq(schema.organizations.id, organizationId)).limit(1);
    if (!org) throw new AppError("NOT_FOUND", "Organization not found");
    const values = { organizationId, planKey, status: opts.status ?? "active", seats: opts.seats ?? null, currentPeriodEnd: opts.currentPeriodEnd ?? null, assignedByUserId: actorUserId };
    const [existing] = await this.db.select().from(schema.organizationPlans).where(eq(schema.organizationPlans.organizationId, organizationId)).limit(1);
    const [row] = existing
      ? await this.db.update(schema.organizationPlans).set(values).where(eq(schema.organizationPlans.id, existing.id)).returning()
      : await this.db.insert(schema.organizationPlans).values(values).returning();
    await this.db.insert(schema.auditEvents).values({ scopeType: "instance", organizationId: null, actorUserId, action: "platform.plan_assigned", targetType: "organization", targetId: organizationId, metadata: { planKey, seats: values.seats } });
    return row;
  }

  /** Organizations without an explicit subscription fall back to the default tier. */
  async planFor(organizationId: string) {
    const [sub] = await this.db.select().from(schema.organizationPlans).where(eq(schema.organizationPlans.organizationId, organizationId)).limit(1);
    const key = sub?.planKey ?? DEFAULT_PLAN_KEY;
    const [plan] = await this.db.select().from(schema.plans).where(eq(schema.plans.key, key)).limit(1);
    return { subscription: sub ?? null, plan: plan ?? null };
  }

  private async usage(organizationId: string) {
    const [{ members }] = await this.db.select({ members: sql<number>`count(*)::int` }).from(schema.organizationMemberships)
      .where(and(eq(schema.organizationMemberships.organizationId, organizationId), eq(schema.organizationMemberships.status, "active"), isNull(schema.organizationMemberships.deletedAt)));
    const [{ projects }] = await this.db.select({ projects: sql<number>`count(*)::int` }).from(schema.projects)
      .where(and(eq(schema.projects.organizationId, organizationId), isNull(schema.projects.deletedAt)));
    const [{ workItems }] = await this.db.select({ workItems: sql<number>`count(*)::int` }).from(schema.workItems)
      .where(and(eq(schema.workItems.organizationId, organizationId), isNull(schema.workItems.deletedAt)));
    return { members, projects, workItems };
  }

  /** What this organization is entitled to, plus what it is actually using. */
  async entitlements(organizationId: string) {
    const { plan, subscription } = await this.planFor(organizationId);
    const limits = (plan?.limits ?? {}) as PlanLimits;
    const seats = subscription?.seats ?? limits.maxMembers ?? null;
    return {
      planKey: plan?.key ?? DEFAULT_PLAN_KEY, planName: plan?.name ?? "Free",
      status: subscription?.status ?? "active",
      currency: plan?.currency ?? "INR", priceMonthly: plan?.priceMonthly ?? 0, priceYearly: plan?.priceYearly ?? 0,
      limits: { ...limits, maxMembers: seats },
      modules: (plan?.modules ?? []) as string[],
      usage: await this.usage(organizationId),
      currentPeriodEnd: subscription?.currentPeriodEnd ?? null,
    };
  }

  /** A module must be in the plan before an organization may switch it on. */
  async isModuleAllowed(organizationId: string, module: string) {
    const { plan } = await this.planFor(organizationId);
    return ((plan?.modules ?? []) as string[]).includes(module);
  }
  async assertModuleAllowed(organizationId: string, module: string) {
    if (!(await this.isModuleAllowed(organizationId, module))) {
      const { plan } = await this.planFor(organizationId);
      throw new AppError("FORBIDDEN", `The ${module} module is not included in the ${plan?.name ?? "current"} plan`, { code: "module_not_in_plan" });
    }
  }

  /** Enforced before creating billable records. null limit = unlimited. */
  async assertWithinLimit(organizationId: string, resource: "members" | "projects" | "workItems") {
    const ent = await this.entitlements(organizationId);
    const limitKey = resource === "members" ? "maxMembers" : resource === "projects" ? "maxProjects" : "maxWorkItems";
    const limit = (ent.limits as Record<string, number | null | undefined>)[limitKey];
    if (limit === null || limit === undefined) return;
    const used = ent.usage[resource];
    if (used >= limit) throw new AppError("FORBIDDEN", `The ${ent.planName} plan allows ${limit} ${resource}. Upgrade the plan to add more.`, { code: "plan_limit_reached", resource, limit, used });
  }
}
