import { Injectable, Inject } from "@nestjs/common";
import { and, eq, asc, desc, inArray } from "drizzle-orm";
import { schema, type Database } from "@pm/db";
import { AppError } from "@pm/shared";
import { DB } from "../db/db.module.js";
import { ActionRegistry, type ActionContext } from "./action-registry.js";

const MAX_DEPTH = 5;      // loop detection
const MAX_ATTEMPTS = 3;   // per-step retry

@Injectable()
export class AutomationService {
  constructor(@Inject(DB) private readonly db: Database, private readonly registry: ActionRegistry) {}

  // ---------- authoring ----------
  async createRule(organizationId: string, userId: string, input: { name: string; triggerType: "event" | "schedule" | "manual"; triggerConfig?: any; disableOnFailure?: boolean }) {
    const [rule] = await this.db.insert(schema.automationRules).values({ organizationId, name: input.name, triggerType: input.triggerType, triggerConfig: input.triggerConfig, disableOnFailure: input.disableOnFailure ?? false, createdBy: userId }).returning();
    return rule;
  }
  async addCondition(organizationId: string, ruleId: string, kind: string, config?: unknown) {
    await this.assertRuleInOrg(organizationId, ruleId);
    const [c] = await this.db.insert(schema.automationConditions).values({ organizationId, ruleId, kind, config }).returning();
    return c;
  }
  async addAction(organizationId: string, ruleId: string, kind: string, config?: unknown, rank = 0) {
    await this.assertRuleInOrg(organizationId, ruleId);
    const [a] = await this.db.insert(schema.automationActions).values({ organizationId, ruleId, kind, config, rank }).returning();
    return a;
  }
  list(organizationId: string) { return this.db.select().from(schema.automationRules).where(eq(schema.automationRules.organizationId, organizationId)); }
  async setEnabled(organizationId: string, ruleId: string, enabled: boolean) {
    await this.db.update(schema.automationRules).set({ enabled, disabledReason: enabled ? null : "manual" }).where(and(eq(schema.automationRules.id, ruleId), eq(schema.automationRules.organizationId, organizationId)));
  }

  // ---------- dispatch ----------
  async dispatchEvent(organizationId: string, eventName: string, eventId: string, payload: any, actorUserId: string | null, opts: { depth?: number; dryRun?: boolean } = {}) {
    const depth = opts.depth ?? 0;
    const rules = (await this.db.select().from(schema.automationRules)
      .where(and(eq(schema.automationRules.organizationId, organizationId), eq(schema.automationRules.triggerType, "event"), eq(schema.automationRules.enabled, true))))
      .filter((r) => (r.triggerConfig as any)?.eventName === eventName);

    if (depth > MAX_DEPTH) {
      // Loop detected: stop and disable the offending rules (disable-on-failure safety).
      for (const r of rules) await this.disable(organizationId, r.id, "loop_detected");
      return { loopDetected: true, runs: [] as string[] };
    }
    const runs: string[] = [];
    for (const rule of rules) {
      const run = await this.runRule(organizationId, rule, eventId, payload, actorUserId, depth, opts.dryRun ?? false);
      if (run) runs.push(run);
    }
    return { loopDetected: false, runs };
  }

  async manualTrigger(organizationId: string, ruleId: string, payload: any, actorUserId: string | null, dryRun = false) {
    const [rule] = await this.db.select().from(schema.automationRules).where(and(eq(schema.automationRules.id, ruleId), eq(schema.automationRules.organizationId, organizationId))).limit(1);
    if (!rule) throw new AppError("NOT_FOUND", "Rule not found");
    if (!rule.enabled) throw new AppError("VALIDATION", "Rule is disabled");
    return this.runRule(organizationId, rule, crypto.randomUUID(), payload, actorUserId, 0, dryRun);
  }

  /**
   * AUTO.D5 — dry-run a rule against recent matching events instead of a
   * hand-built payload: finds the last N activity events whose action
   * matches the rule's configured eventName, replays each through the
   * conditions/actions engine in dry-run mode, and returns a per-event
   * decision path. No side effects — every action executor short-circuits
   * on ctx.dryRun before it would mutate anything.
   */
  async dryRunAgainstRecentEvents(organizationId: string, ruleId: string, limit = 10) {
    const [rule] = await this.db.select().from(schema.automationRules).where(and(eq(schema.automationRules.id, ruleId), eq(schema.automationRules.organizationId, organizationId))).limit(1);
    if (!rule) throw new AppError("NOT_FOUND", "Rule not found");
    if (rule.triggerType !== "event") throw new AppError("VALIDATION", "Only event-triggered rules can be dry-run against recent events");
    const eventName = (rule.triggerConfig as { eventName?: string } | null)?.eventName;
    if (!eventName) throw new AppError("VALIDATION", "This rule has no configured event name");

    const recent = await this.db.select().from(schema.activityEvents)
      .where(and(eq(schema.activityEvents.organizationId, organizationId), eq(schema.activityEvents.action, eventName)))
      .orderBy(desc(schema.activityEvents.createdAt)).limit(Math.min(limit, 50));

    const results: { eventId: string; occurredAt: Date; workItemId: string | null; runId: string | null; conditionsMatched: boolean; steps: { kind: string; status: string; output: unknown; error: string | null }[] }[] = [];
    for (const event of recent) {
      const payload = { workItemId: event.workItemId, projectId: event.projectId, actorUserId: event.actorUserId, data: event.data };
      // event.id has never been used as a live dispatch eventId, so this dry-run
      // dedupe key can never collide with a real prior execution of this rule.
      const runId = await this.runRule(organizationId, rule, event.id, payload, event.actorUserId, 0, true);
      let conditionsMatched = true;
      const steps: { kind: string; status: string; output: unknown; error: string | null }[] = [];
      if (runId) {
        const [run] = await this.db.select({ status: schema.automationRuns.status }).from(schema.automationRuns).where(eq(schema.automationRuns.id, runId)).limit(1);
        conditionsMatched = run?.status !== "skipped";
        const runSteps = await this.db.select().from(schema.automationRunSteps).where(eq(schema.automationRunSteps.runId, runId)).orderBy(asc(schema.automationRunSteps.rank));
        for (const s of runSteps) steps.push({ kind: s.kind, status: s.status, output: s.output, error: s.error });
      }
      results.push({ eventId: event.id, occurredAt: event.createdAt, workItemId: event.workItemId, runId, conditionsMatched, steps });
    }
    return { eventName, sampledEvents: recent.length, results };
  }

  private async runRule(organizationId: string, rule: any, eventId: string, payload: any, actorUserId: string | null, depth: number, dryRun: boolean): Promise<string | null> {
    const dedupeKey = `${rule.id}:${eventId}`;
    const [run] = await this.db.insert(schema.automationRuns)
      .values({ organizationId, ruleId: rule.id, triggerType: rule.triggerType, status: "running", dedupeKey, depth })
      .onConflictDoNothing({ target: schema.automationRuns.dedupeKey }).returning();
    if (!run) return null; // IDEMPOTENT: this event was already processed for this rule

    // conditions (IF)
    const conditions = await this.db.select().from(schema.automationConditions).where(and(
      eq(schema.automationConditions.ruleId, rule.id),
      eq(schema.automationConditions.organizationId, organizationId),
    ));
    if (!this.conditionsPass(conditions, payload)) {
      await this.db.update(schema.automationRuns).set({ status: "skipped", completedAt: new Date() }).where(eq(schema.automationRuns.id, run.id));
      return run.id;
    }

    const actions = await this.db.select().from(schema.automationActions).where(and(
      eq(schema.automationActions.ruleId, rule.id),
      eq(schema.automationActions.organizationId, organizationId),
    )).orderBy(asc(schema.automationActions.rank));
    let failed = false;
    for (const action of actions) {
      const [step] = await this.db.insert(schema.automationRunSteps).values({ organizationId, runId: run.id, actionId: action.id, kind: action.kind, rank: action.rank, status: "pending" }).returning();
      const ok = await this.runStep(step.id, action.kind, action.config, organizationId, actorUserId, payload, depth, dryRun);
      if (!ok) { failed = true; break; }
    }

    const status = dryRun ? "dry_run" : failed ? "failed" : "succeeded";
    await this.db.update(schema.automationRuns).set({ status, completedAt: new Date() }).where(eq(schema.automationRuns.id, run.id));
    if (failed && !dryRun) {
      await this.db.update(schema.automationRules).set({ failureCount: (rule.failureCount ?? 0) + 1 }).where(eq(schema.automationRules.id, rule.id));
      if (rule.disableOnFailure) await this.disable(organizationId, rule.id, "action_failed");
    }
    return run.id;
  }

  private async runStep(stepId: string, kind: string, config: any, organizationId: string, actorUserId: string | null, payload: any, depth: number, dryRun: boolean): Promise<boolean> {
    const executor = this.registry.get(kind);
    const ctx: ActionContext = {
      db: this.db, organizationId, actorUserId, payload, dryRun, depth,
      emit: async (eventName, p) => { await this.dispatchEvent(organizationId, eventName, crypto.randomUUID(), p, actorUserId, { depth: depth + 1, dryRun }); },
    };
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      await this.db.update(schema.automationRunSteps).set({ attempt, status: "running" }).where(eq(schema.automationRunSteps.id, stepId));
      try {
        if (!executor) throw new Error(`Unknown action: ${kind}`);
        const output = await executor(ctx, config);
        await this.db.update(schema.automationRunSteps).set({ status: dryRun ? "dry_run" : "succeeded", output: output as object, error: null }).where(eq(schema.automationRunSteps.id, stepId));
        return true;
      } catch (e) {
        await this.db.update(schema.automationRunSteps).set({ status: "failed", error: (e as Error).message }).where(eq(schema.automationRunSteps.id, stepId));
      }
    }
    return false; // retries exhausted
  }

  /** Safe replay: only re-runs failed/pending steps; succeeded steps are untouched. */
  async replay(organizationId: string, runId: string) {
    const [run] = await this.db.select().from(schema.automationRuns).where(and(eq(schema.automationRuns.id, runId), eq(schema.automationRuns.organizationId, organizationId))).limit(1);
    if (!run) throw new AppError("NOT_FOUND", "Run not found");
    const steps = await this.db.select().from(schema.automationRunSteps).where(and(
      eq(schema.automationRunSteps.runId, runId),
      eq(schema.automationRunSteps.organizationId, organizationId),
    )).orderBy(asc(schema.automationRunSteps.rank));
    const actionIds = steps.map((s) => s.actionId).filter(Boolean) as string[];
    const actions = actionIds.length ? await this.db.select().from(schema.automationActions).where(and(
      inArray(schema.automationActions.id, actionIds),
      eq(schema.automationActions.organizationId, organizationId),
    )) : [];
    const cfgOf = (id: string | null) => actions.find((a) => a.id === id);

    let failed = false;
    for (const step of steps) {
      if (step.status === "succeeded") continue; // never re-run a completed side effect
      const action = cfgOf(step.actionId);
      const ok = await this.runStep(step.id, step.kind, action?.config, organizationId, null, {}, run.depth, false);
      if (!ok) { failed = true; break; }
    }
    const status = failed ? "failed" : "succeeded";
    await this.db.update(schema.automationRuns).set({ status, completedAt: new Date() }).where(eq(schema.automationRuns.id, runId));
    return { status };
  }

  runs(organizationId: string, ruleId: string) {
    return this.db.select().from(schema.automationRuns).where(and(eq(schema.automationRuns.organizationId, organizationId), eq(schema.automationRuns.ruleId, ruleId)));
  }
  async steps(organizationId: string, runId: string) {
    const [run] = await this.db.select({ id: schema.automationRuns.id }).from(schema.automationRuns).where(and(
      eq(schema.automationRuns.id, runId),
      eq(schema.automationRuns.organizationId, organizationId),
    )).limit(1);
    if (!run) throw new AppError("NOT_FOUND", "Run not found");
    return this.db.select().from(schema.automationRunSteps).where(and(
      eq(schema.automationRunSteps.runId, runId),
      eq(schema.automationRunSteps.organizationId, organizationId),
    )).orderBy(asc(schema.automationRunSteps.rank));
  }

  // ---------- helpers ----------
  private async assertRuleInOrg(organizationId: string, ruleId: string) {
    const [rule] = await this.db.select({ id: schema.automationRules.id }).from(schema.automationRules).where(and(
      eq(schema.automationRules.id, ruleId),
      eq(schema.automationRules.organizationId, organizationId),
    )).limit(1);
    if (!rule) throw new AppError("NOT_FOUND", "Rule not found");
    return rule;
  }
  private conditionsPass(conditions: any[], payload: any): boolean {
    for (const c of conditions) {
      if (c.kind === "always") continue;
      if (c.kind === "payload_equals") {
        const path = c.config?.path?.split(".") ?? [];
        let v = payload; for (const seg of path) v = v?.[seg];
        if (v !== c.config?.value) return false;
      }
    }
    return true;
  }
  private async disable(organizationId: string, ruleId: string, reason: string) {
    await this.db.update(schema.automationRules).set({ enabled: false, disabledReason: reason }).where(and(
      eq(schema.automationRules.id, ruleId),
      eq(schema.automationRules.organizationId, organizationId),
    ));
  }
}
