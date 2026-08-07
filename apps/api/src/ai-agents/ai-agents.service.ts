import { Inject, Injectable } from "@nestjs/common";
import { and, desc, eq, gt, inArray, isNull, lte, or, sql } from "drizzle-orm";
import { schema, type Database } from "@pm/db";
import { AppError } from "@pm/shared";
import { DB } from "../db/db.module.js";
import { ModulesService } from "../modules/modules.service.js";
import { AiService } from "../ai/ai.service.js";
import { WorkItemsService } from "../work/work-items.service.js";
import { canAccessProject, canAccessWorkItem } from "../collab/access.js";

const SAFE_ACTIONS = new Set(["research", "summarize", "classify", "draft", "risk_review", "status_report"]);
const CHECKPOINT_ACTIONS = new Set(["create_task", "create_subtask", "update_status", "external_send", "mass_update", "delete", "approve"]);
const TOOL_BY_ACTION: Record<string, string> = {
  research: "search.read",
  summarize: "work.read",
  classify: "work.read",
  draft: "work.read",
  risk_review: "work.read",
  status_report: "work.read",
  create_task: "work.create",
  create_subtask: "work.create",
  update_status: "work.update",
  mass_update: "work.bulk_update",
  external_send: "communications.send",
  delete: "work.delete",
  approve: "approval.decide",
};

type AgentInput = {
  action?: string;
  query?: string;
  projectId?: string;
  workItemId?: string;
  parentId?: string;
  title?: string;
  description?: string;
  status?: string;
  itemIds?: string[];
  payload?: Record<string, unknown>;
  remember?: boolean;
};

function monthStart(now = new Date()) {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

@Injectable()
export class AiAgentsService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly modules: ModulesService,
    private readonly ai: AiService,
    private readonly workItems: WorkItemsService,
  ) {}

  private enabled(org: string) { return this.modules.assertEnabled(org, "ai_agents"); }

  async overview(org: string) {
    await this.enabled(org);
    const [teammates, pending, recent, budgets] = await Promise.all([
      this.db.select().from(schema.aiTeammates).where(eq(schema.aiTeammates.organizationId, org)).orderBy(schema.aiTeammates.name),
      this.db.select().from(schema.humanCheckpoints).where(and(eq(schema.humanCheckpoints.organizationId, org), eq(schema.humanCheckpoints.status, "pending"))).orderBy(desc(schema.humanCheckpoints.createdAt)).limit(100),
      this.db.select().from(schema.agentRuns).where(eq(schema.agentRuns.organizationId, org)).orderBy(desc(schema.agentRuns.startedAt)).limit(100),
      this.db.select().from(schema.aiUsageBudgets).where(eq(schema.aiUsageBudgets.organizationId, org)).orderBy(desc(schema.aiUsageBudgets.periodStart)),
    ]);
    return { teammates, pendingCheckpoints: pending, recentRuns: recent, budgets };
  }

  async createTeammate(org: string, userId: string, input: { name: string; role: string; skills?: string[]; allowedProjectIds?: string[]; provider?: string; model?: string; policy?: Partial<{ allowedActions: string[]; destructiveActions: string[]; externalSendRequiresCheckpoint: boolean; massMutationLimit: number; maxRunTokens: number; maxDailyTokens: number; retentionDays: number }>; tokenLimit?: number; costLimitMicros?: number }) {
    await this.enabled(org);
    const allowedProjectIds = [...new Set(input.allowedProjectIds ?? [])];
    for (const projectId of allowedProjectIds) if (!(await canAccessProject(this.db, org, projectId, userId))) throw new AppError("FORBIDDEN", "Cannot grant the agent access to an inaccessible project");
    return this.db.transaction(async (tx) => {
      const [teammate] = await tx.insert(schema.aiTeammates).values({ organizationId: org, name: input.name.trim(), role: input.role.trim(), skills: input.skills ?? [], allowedProjectIds, humanOwnerUserId: userId, provider: input.provider ?? "default", model: input.model }).returning();
      const allowedActions = input.policy?.allowedActions ?? ["research", "summarize", "classify", "draft", "risk_review", "status_report", "create_task", "create_subtask", "update_status"];
      const [policy] = await tx.insert(schema.agentPolicies).values({ organizationId: org, teammateId: teammate.id, allowedActions, destructiveActions: input.policy?.destructiveActions ?? ["delete", "external_send", "mass_update", "approve"], externalSendRequiresCheckpoint: input.policy?.externalSendRequiresCheckpoint ?? true, massMutationLimit: Math.max(1, input.policy?.massMutationLimit ?? 10), maxRunTokens: Math.max(100, input.policy?.maxRunTokens ?? 10000), maxDailyTokens: Math.max(100, input.policy?.maxDailyTokens ?? 50000), retentionDays: Math.max(1, input.policy?.retentionDays ?? 30), updatedByUserId: userId }).returning();
      const [budget] = await tx.insert(schema.aiUsageBudgets).values({ organizationId: org, teammateId: teammate.id, period: "monthly", tokenLimit: Math.max(1000, input.tokenLimit ?? 100000), costLimitMicros: Math.max(0, input.costLimitMicros ?? 0), periodStart: monthStart() }).returning();
      return { teammate, policy, budget };
    });
  }

  async updatePolicy(org: string, userId: string, teammateId: string, input: Partial<{ allowedActions: string[]; destructiveActions: string[]; externalSendRequiresCheckpoint: boolean; massMutationLimit: number; maxRunTokens: number; maxDailyTokens: number; retentionDays: number }>) {
    await this.enabled(org);
    await this.teammate(org, teammateId);
    const [row] = await this.db.update(schema.agentPolicies).set({ ...input, updatedByUserId: userId, updatedAt: new Date() }).where(and(eq(schema.agentPolicies.organizationId, org), eq(schema.agentPolicies.teammateId, teammateId))).returning();
    if (!row) throw new AppError("NOT_FOUND", "Agent policy not found");
    return row;
  }

  async grantTool(org: string, userId: string, teammateId: string, input: { toolKey: string; scope?: Record<string, unknown>; enabled?: boolean }) {
    await this.enabled(org);
    await this.teammate(org, teammateId);
    const existing = await this.db.select().from(schema.agentToolGrants).where(and(eq(schema.agentToolGrants.organizationId, org), eq(schema.agentToolGrants.teammateId, teammateId), eq(schema.agentToolGrants.toolKey, input.toolKey))).limit(1).then((r) => r[0]);
    if (existing) return (await this.db.update(schema.agentToolGrants).set({ scope: input.scope ?? existing.scope, enabled: input.enabled ?? true, grantedByUserId: userId }).where(eq(schema.agentToolGrants.id, existing.id)).returning())[0];
    return (await this.db.insert(schema.agentToolGrants).values({ organizationId: org, teammateId, toolKey: input.toolKey, scope: input.scope ?? {}, enabled: input.enabled ?? true, grantedByUserId: userId }).returning())[0];
  }

  private async teammate(org: string, id: string) {
    const [teammate] = await this.db.select().from(schema.aiTeammates).where(and(eq(schema.aiTeammates.organizationId, org), eq(schema.aiTeammates.id, id), eq(schema.aiTeammates.active, true))).limit(1);
    if (!teammate) throw new AppError("NOT_FOUND", "AI teammate not found or inactive");
    const [policy] = await this.db.select().from(schema.agentPolicies).where(and(eq(schema.agentPolicies.organizationId, org), eq(schema.agentPolicies.teammateId, id))).limit(1);
    if (!policy) throw new AppError("CONFLICT", "AI teammate policy is missing");
    return { teammate, policy };
  }

  private async assertScope(org: string, userId: string, teammate: typeof schema.aiTeammates.$inferSelect, input: AgentInput) {
    const allowed = teammate.allowedProjectIds as string[];
    let projectId = input.projectId;
    if (input.workItemId || input.parentId) {
      const workItemId = input.workItemId ?? input.parentId!;
      if (!(await canAccessWorkItem(this.db, org, workItemId, userId))) throw new AppError("FORBIDDEN", "Initiating user cannot access the work item");
      const [item] = await this.db.select({ projectId: schema.workItems.owningProjectId }).from(schema.workItems).where(and(eq(schema.workItems.organizationId, org), eq(schema.workItems.id, workItemId), isNull(schema.workItems.deletedAt))).limit(1);
      projectId = item?.projectId;
    }
    if (projectId) {
      if (!(await canAccessProject(this.db, org, projectId, userId))) throw new AppError("FORBIDDEN", "Initiating user cannot access the project");
      if (allowed.length && !allowed.includes(projectId)) throw new AppError("FORBIDDEN", "AI teammate is not allowed in this project");
    }
    return projectId;
  }

  private async assertTool(org: string, teammateId: string, action: string) {
    const toolKey = TOOL_BY_ACTION[action];
    if (!toolKey) throw new AppError("VALIDATION", `Unknown agent action: ${action}`);
    const grants = await this.db.select().from(schema.agentToolGrants).where(and(eq(schema.agentToolGrants.organizationId, org), eq(schema.agentToolGrants.teammateId, teammateId), eq(schema.agentToolGrants.enabled, true)));
    // Safe read operations have an implicit minimum grant so a new teammate can draft immediately.
    if (SAFE_ACTIONS.has(action)) return toolKey;
    if (!grants.some((g) => g.toolKey === toolKey)) throw new AppError("FORBIDDEN", `Tool grant required: ${toolKey}`);
    return toolKey;
  }

  private async reserveBudget(org: string, teammateId: string, policy: typeof schema.agentPolicies.$inferSelect, estimatedTokens: number) {
    if (estimatedTokens > policy.maxRunTokens) throw new AppError("RATE_LIMITED", "Run token limit exceeded");
    const start = monthStart();
    let [budget] = await this.db.select().from(schema.aiUsageBudgets).where(and(eq(schema.aiUsageBudgets.organizationId, org), eq(schema.aiUsageBudgets.teammateId, teammateId), eq(schema.aiUsageBudgets.period, "monthly"), eq(schema.aiUsageBudgets.periodStart, start))).limit(1);
    if (!budget) [budget] = await this.db.insert(schema.aiUsageBudgets).values({ organizationId: org, teammateId, period: "monthly", periodStart: start }).returning();
    if (budget.tokenUsed + estimatedTokens > budget.tokenLimit) throw new AppError("RATE_LIMITED", "AI teammate monthly token budget exceeded");
    const dayStart = new Date(); dayStart.setUTCHours(0, 0, 0, 0);
    const [daily] = await this.db.select({ used: sql<number>`coalesce(sum(${schema.agentRuns.tokensUsed}), 0)` }).from(schema.agentRuns).where(and(eq(schema.agentRuns.organizationId, org), eq(schema.agentRuns.teammateId, teammateId), gt(schema.agentRuns.startedAt, dayStart)));
    if (Number(daily?.used ?? 0) + estimatedTokens > policy.maxDailyTokens) throw new AppError("RATE_LIMITED", "AI teammate daily token budget exceeded");
    return budget;
  }

  async startRun(org: string, userId: string, teammateId: string, task: string, input: AgentInput = {}) {
    await this.enabled(org);
    const { teammate, policy } = await this.teammate(org, teammateId);
    const action = input.action ?? "research";
    const allowedActions = policy.allowedActions as string[];
    if (!allowedActions.includes(action)) throw new AppError("FORBIDDEN", `Agent policy does not allow ${action}`);
    const projectId = await this.assertScope(org, userId, teammate, input);
    const toolKey = await this.assertTool(org, teammateId, action);
    if (action === "mass_update" && (input.itemIds?.length ?? 0) > policy.massMutationLimit) throw new AppError("VALIDATION", `Mass mutation limit is ${policy.massMutationLimit}`);
    const estimatedTokens = Math.max(1, Math.ceil((task.length + JSON.stringify(input).length) / 4));
    const budget = await this.reserveBudget(org, teammateId, policy, estimatedTokens);
    const [run] = await this.db.insert(schema.agentRuns).values({ organizationId: org, teammateId, initiatedByUserId: userId, workItemId: input.workItemId ?? input.parentId, task, input, status: "running", timeline: [{ at: new Date().toISOString(), event: "run.started", action, toolKey }] }).returning();

    try {
      const citations = await this.ai.retrieve(org, userId, input.query ?? task);
      const proposal = this.makeProposal(action, task, input, projectId);
      const needsCheckpoint = CHECKPOINT_ACTIONS.has(action) || (policy.destructiveActions as string[]).includes(action) || (action === "external_send" && policy.externalSendRequiresCheckpoint);
      const output = {
        label: "AI-generated draft",
        action,
        summary: SAFE_ACTIONS.has(action) ? this.safeSummary(task, citations.length) : "Action prepared for human review.",
        proposal,
        uncertainty: citations.length ? "Grounded in accessible cited records." : "No matching accessible records were found; review carefully.",
        provider: teammate.provider,
        model: teammate.model,
      };
      let checkpoint = null;
      if (needsCheckpoint) {
        [checkpoint] = await this.db.insert(schema.humanCheckpoints).values({ organizationId: org, agentRunId: run.id, actionKey: action, proposal, status: "pending", requiredRoleKey: action === "approve" ? "approver" : null }).returning();
      }
      await this.db.update(schema.agentRuns).set({ status: needsCheckpoint ? "awaiting_approval" : "completed", output, citations, toolCalls: [{ toolKey, status: "completed" }], timeline: [{ at: run.startedAt.toISOString(), event: "run.started", action, toolKey }, { at: new Date().toISOString(), event: needsCheckpoint ? "checkpoint.created" : "run.completed" }], tokensUsed: estimatedTokens, qualityScore: citations.length ? 85 : 65, finishedAt: needsCheckpoint ? null : new Date() }).where(eq(schema.agentRuns.id, run.id));
      await this.db.update(schema.aiUsageBudgets).set({ tokenUsed: sql`${schema.aiUsageBudgets.tokenUsed} + ${estimatedTokens}`, updatedAt: new Date() }).where(eq(schema.aiUsageBudgets.id, budget.id));
      if (input.remember && projectId) await this.remember(org, userId, teammateId, { projectId, scopeType: "project", memoryKey: `run:${run.id}`, content: output.summary, sourceRefs: citations });
      return { runId: run.id, status: needsCheckpoint ? "awaiting_approval" : "completed", output, citations, checkpoint };
    } catch (error) {
      await this.db.update(schema.agentRuns).set({ status: "failed", error: error instanceof Error ? error.message : "Agent run failed", finishedAt: new Date(), timeline: [{ at: run.startedAt.toISOString(), event: "run.started", action, toolKey }, { at: new Date().toISOString(), event: "run.failed" }] }).where(eq(schema.agentRuns.id, run.id));
      throw error;
    }
  }

  private safeSummary(task: string, citationCount: number) {
    const compact = task.replace(/\s+/g, " ").trim().slice(0, 600);
    return `${compact}${compact.endsWith(".") ? "" : "."} ${citationCount} accessible source${citationCount === 1 ? "" : "s"} reviewed.`;
  }

  private makeProposal(action: string, task: string, input: AgentInput, projectId?: string) {
    if (action === "create_task") return { projectId, title: input.title ?? task.slice(0, 120), description: input.description ?? task };
    if (action === "create_subtask") return { parentId: input.parentId ?? input.workItemId, projectId, title: input.title ?? task.slice(0, 120), description: input.description ?? task };
    if (action === "update_status") return { workItemId: input.workItemId, status: input.status ?? "In Progress" };
    if (action === "mass_update") return { itemIds: input.itemIds ?? [], patch: input.payload ?? {} };
    if (action === "external_send") return { channel: "communications", payload: input.payload ?? {}, draft: input.description ?? task };
    return { task, query: input.query ?? task, payload: input.payload ?? {} };
  }

  async decideCheckpoint(org: string, userId: string, checkpointId: string, input: { decision: "approve" | "reject"; reason?: string }) {
    await this.enabled(org);
    const [checkpoint] = await this.db.select().from(schema.humanCheckpoints).where(and(eq(schema.humanCheckpoints.organizationId, org), eq(schema.humanCheckpoints.id, checkpointId))).limit(1);
    if (!checkpoint || checkpoint.status !== "pending") throw new AppError("NOT_FOUND", "Pending checkpoint not found");
    const [run] = await this.db.select().from(schema.agentRuns).where(and(eq(schema.agentRuns.organizationId, org), eq(schema.agentRuns.id, checkpoint.agentRunId))).limit(1);
    if (!run) throw new AppError("NOT_FOUND", "Agent run not found");
    const { policy } = await this.teammate(org, run.teammateId);
    const highRisk = (policy.destructiveActions as string[]).includes(checkpoint.actionKey) || ["external_send", "mass_update", "delete", "approve"].includes(checkpoint.actionKey);
    if (highRisk && run.initiatedByUserId === userId) throw new AppError("FORBIDDEN", "A different reviewer must approve high-risk agent actions");
    if (input.decision === "reject") {
      await this.db.transaction(async (tx) => {
        await tx.update(schema.humanCheckpoints).set({ status: "rejected", decidedByUserId: userId, decisionReason: input.reason, decidedAt: new Date() }).where(eq(schema.humanCheckpoints.id, checkpointId));
        await tx.update(schema.agentRuns).set({ status: "rejected", finishedAt: new Date(), timeline: sql`${schema.agentRuns.timeline} || ${JSON.stringify([{ at: new Date().toISOString(), event: "checkpoint.rejected", reviewer: userId }])}::jsonb` }).where(eq(schema.agentRuns.id, run.id));
      });
      return { checkpointId, rejected: true };
    }
    const result = await this.executeProposal(org, userId, checkpoint.actionKey, checkpoint.proposal as Record<string, unknown>);
    await this.db.transaction(async (tx) => {
      await tx.update(schema.humanCheckpoints).set({ status: "approved", decidedByUserId: userId, decisionReason: input.reason, decidedAt: new Date() }).where(eq(schema.humanCheckpoints.id, checkpointId));
      await tx.update(schema.agentRuns).set({ status: "completed", finishedAt: new Date(), output: sql`${schema.agentRuns.output} || ${JSON.stringify({ execution: result })}::jsonb`, timeline: sql`${schema.agentRuns.timeline} || ${JSON.stringify([{ at: new Date().toISOString(), event: "checkpoint.approved", reviewer: userId }])}::jsonb` }).where(eq(schema.agentRuns.id, run.id));
    });
    return { checkpointId, approved: true, result };
  }

  private safeWorkPatch(input: Record<string, unknown>): Parameters<WorkItemsService["update"]>[4] {
    const patch: Parameters<WorkItemsService["update"]>[4] = {};
    if (typeof input.title === "string") patch.title = input.title;
    if (typeof input.description === "string") patch.description = input.description;
    if (typeof input.status === "string") patch.status = input.status;
    if (typeof input.priority === "string") patch.priority = input.priority;
    if (typeof input.startDate === "string") patch.startDate = input.startDate;
    if (typeof input.dueDate === "string") patch.dueDate = input.dueDate;
    if (typeof input.primaryOwnerUserId === "string") patch.primaryOwnerUserId = input.primaryOwnerUserId;
    if (typeof input.scheduleMode === "string") patch.scheduleMode = input.scheduleMode;
    if (input.durationDays === null) patch.durationDays = null;
    else if (typeof input.durationDays === "number" && Number.isFinite(input.durationDays)) patch.durationDays = Math.max(0, Math.trunc(input.durationDays));
    if (typeof input.progress === "number" && Number.isFinite(input.progress)) patch.progress = Math.max(0, Math.min(100, Math.trunc(input.progress)));
    if (Object.keys(patch).length === 0) throw new AppError("VALIDATION", "AI proposal contains no permitted Work Item fields");
    return patch;
  }

  private async executeProposal(org: string, userId: string, action: string, proposal: Record<string, unknown>) {
    if (action === "create_task") return this.workItems.create(org, userId, { projectId: String(proposal.projectId), title: String(proposal.title), description: proposal.description ? String(proposal.description) : undefined });
    if (action === "create_subtask") return this.workItems.create(org, userId, { projectId: String(proposal.projectId), parentId: String(proposal.parentId), typeKey: "subtask", title: String(proposal.title), description: proposal.description ? String(proposal.description) : undefined });
    if (action === "update_status") {
      const id = String(proposal.workItemId);
      if (!(await canAccessWorkItem(this.db, org, id, userId))) throw new AppError("FORBIDDEN", "Reviewer cannot access work item");
      const [item] = await this.db.select().from(schema.workItems).where(and(eq(schema.workItems.organizationId, org), eq(schema.workItems.id, id), isNull(schema.workItems.deletedAt))).limit(1);
      if (!item) throw new AppError("NOT_FOUND", "Work item not found");
      return this.workItems.update(org, id, userId, item.version, { status: String(proposal.status) });
    }
    if (action === "mass_update") {
      const ids = Array.isArray(proposal.itemIds) ? proposal.itemIds.map(String) : [];
      const patch = this.safeWorkPatch((proposal.patch ?? {}) as Record<string, unknown>);
      const results = [];
      for (const id of ids) {
        try {
          if (!(await canAccessWorkItem(this.db, org, id, userId))) throw new AppError("FORBIDDEN", "No access");
          const [item] = await this.db.select().from(schema.workItems).where(and(eq(schema.workItems.organizationId, org), eq(schema.workItems.id, id), isNull(schema.workItems.deletedAt))).limit(1);
          if (!item) throw new AppError("NOT_FOUND", "Not found");
          results.push({ id, status: "updated", value: await this.workItems.update(org, id, userId, item.version, patch) });
        } catch (error) { results.push({ id, status: "failed", error: error instanceof Error ? error.message : "Failed" }); }
      }
      return { results };
    }
    if (action === "external_send") return { status: "approved_for_delivery", draft: proposal.draft, channel: proposal.channel, payload: proposal.payload, note: "Delivery adapter must send this approved payload." };
    return { status: "approved", proposal };
  }

  async remember(org: string, userId: string, teammateId: string, input: { workspaceId?: string; projectId?: string; scopeType?: string; memoryKey: string; content: string; sourceRefs?: unknown[]; retentionDays?: number }) {
    await this.enabled(org);
    const { policy } = await this.teammate(org, teammateId);
    if (input.projectId && !(await canAccessProject(this.db, org, input.projectId, userId))) throw new AppError("FORBIDDEN", "No access to memory project");
    const retentionDays = Math.min(Math.max(1, input.retentionDays ?? policy.retentionDays), policy.retentionDays);
    const retentionUntil = new Date(Date.now() + retentionDays * 86400000);
    return (await this.db.insert(schema.aiMemoryRecords).values({ organizationId: org, teammateId, workspaceId: input.workspaceId, projectId: input.projectId, scopeType: input.scopeType ?? (input.projectId ? "project" : "organization"), memoryKey: input.memoryKey, content: input.content, sourceRefs: input.sourceRefs ?? [], retentionUntil, createdByUserId: userId }).returning())[0];
  }

  async memories(org: string, userId: string, teammateId: string) {
    await this.enabled(org);
    const rows = await this.db.select().from(schema.aiMemoryRecords).where(and(eq(schema.aiMemoryRecords.organizationId, org), eq(schema.aiMemoryRecords.teammateId, teammateId), or(isNull(schema.aiMemoryRecords.retentionUntil), gt(schema.aiMemoryRecords.retentionUntil, new Date())))).orderBy(desc(schema.aiMemoryRecords.createdAt));
    const visible = [];
    for (const row of rows) if (!row.projectId || await canAccessProject(this.db, org, row.projectId, userId)) visible.push(row);
    return visible;
  }

  async deleteMemory(org: string, userId: string, id: string) {
    await this.enabled(org);
    const [row] = await this.db.select().from(schema.aiMemoryRecords).where(and(eq(schema.aiMemoryRecords.organizationId, org), eq(schema.aiMemoryRecords.id, id))).limit(1);
    if (!row) throw new AppError("NOT_FOUND", "Memory not found");
    if (row.projectId && !(await canAccessProject(this.db, org, row.projectId, userId))) throw new AppError("FORBIDDEN", "No access");
    await this.db.delete(schema.aiMemoryRecords).where(eq(schema.aiMemoryRecords.id, id));
    return { id, deleted: true };
  }

  async run(org: string, userId: string, id: string) {
    await this.enabled(org);
    const [run] = await this.db.select().from(schema.agentRuns).where(and(eq(schema.agentRuns.organizationId, org), eq(schema.agentRuns.id, id))).limit(1);
    if (!run) throw new AppError("NOT_FOUND", "Agent run not found");
    if (run.workItemId && !(await canAccessWorkItem(this.db, org, run.workItemId, userId))) throw new AppError("FORBIDDEN", "No access to run source");
    const checkpoints = await this.db.select().from(schema.humanCheckpoints).where(eq(schema.humanCheckpoints.agentRunId, id));
    return { run, checkpoints };
  }

  async cleanupExpiredMemory(org: string) {
    await this.enabled(org);
    const rows = await this.db.delete(schema.aiMemoryRecords).where(and(eq(schema.aiMemoryRecords.organizationId, org), lte(schema.aiMemoryRecords.retentionUntil, new Date()))).returning({ id: schema.aiMemoryRecords.id });
    return { deleted: rows.length };
  }
}
