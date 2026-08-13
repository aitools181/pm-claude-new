import { createServer } from "node:http";
import { Worker, Queue, QueueEvents } from "bullmq";
import { and, desc, eq, isNotNull, isNull, lt, sql } from "drizzle-orm";
import { Redis } from "ioredis";
import { getDb, schema } from "@pm/db";
import { runIdempotent, type ScopedJob } from "./job-runner.js";

const connection = new Redis(process.env.REDIS_URL ?? "redis://localhost:6379", { maxRetriesPerRequest: null });
const database = getDb(process.env.DATABASE_URL!);

const QUEUE = "system";
const DLQ = "system-dead";
const DAY_MS = 86_400_000;
export const systemQueue = new Queue(QUEUE, {
  connection,
  defaultJobOptions: {
    attempts: 5,
    backoff: { type: "exponential", delay: 1000 },
    removeOnComplete: 1000,
    removeOnFail: false,
  },
});
const deadLetter = new Queue(DLQ, { connection });

async function permanentDeleteWorkItem(organizationId: string, id: string) {
  // Keep this order aligned with the API's irreversible recycle-bin purge. All
  // predicates remain tenant scoped at the final delete boundary.
  await database.transaction(async (tx) => {
    await tx.delete(schema.workItemStatusHistory).where(eq(schema.workItemStatusHistory.workItemId, id));
    await tx.delete(schema.workItemAssignees).where(eq(schema.workItemAssignees.workItemId, id));
    await tx.delete(schema.workItemPlacements).where(eq(schema.workItemPlacements.workItemId, id));
    await tx.delete(schema.activityEvents).where(eq(schema.activityEvents.workItemId, id));
    await tx.delete(schema.workItems).where(and(
      eq(schema.workItems.id, id),
      eq(schema.workItems.organizationId, organizationId),
      isNotNull(schema.workItems.deletedAt),
    ));
  });
}

async function purgeOrgRetention(organizationId: string, now = new Date()) {
  const policies = await database.select().from(schema.retentionPolicies).where(and(
    eq(schema.retentionPolicies.organizationId, organizationId),
    eq(schema.retentionPolicies.autoPurge, true),
  ));
  const ids: string[] = [];
  for (const policy of policies) {
    if (policy.entity !== "work_item") continue;
    const cutoff = new Date(now.getTime() - policy.retentionDays * DAY_MS);
    const expired = await database.select({ id: schema.workItems.id }).from(schema.workItems).where(and(
      eq(schema.workItems.organizationId, organizationId),
      isNotNull(schema.workItems.deletedAt),
      lt(schema.workItems.deletedAt, cutoff),
    ));
    for (const row of expired) {
      await permanentDeleteWorkItem(organizationId, row.id);
      ids.push(row.id);
    }
  }
  return { organizationId, purged: ids.length, ids };
}


async function summarizeWithConfiguredProvider(prompt: string) {
  const provider = process.env.AI_PROVIDER ?? "disabled";
  if (provider !== "openai_compatible") return { text: "", tokens: 0, degraded: true };
  const baseUrl = process.env.AI_BASE_URL ?? "";
  const apiKey = process.env.AI_API_KEY ?? "";
  const model = process.env.AI_MODEL ?? "";
  if (!baseUrl || !apiKey || !model) return { text: "", tokens: 0, degraded: true };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20_000);
  try {
    const response = await fetch(`${baseUrl.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      signal: controller.signal,
      headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model, temperature: 0.2, max_tokens: 500, messages: [
        { role: "system", content: "Summarize project-management information clearly and concisely. State risks and sources only when supplied. Do not invent facts." },
        { role: "user", content: prompt },
      ] }),
    });
    if (!response.ok) throw new Error(`provider_http_${response.status}`);
    const body = await response.json() as any;
    const text = String(body?.choices?.[0]?.message?.content ?? "").trim();
    if (!text) throw new Error("provider_empty_response");
    const tokens = Number(body?.usage?.total_tokens ?? Math.max(1, Math.ceil(prompt.length / 4)));
    return { text, tokens: Number.isFinite(tokens) ? tokens : 0, degraded: false };
  } catch {
    return { text: "", tokens: 0, degraded: true };
  } finally { clearTimeout(timer); }
}

async function consumeAiTokens(organizationId: string, tokens: number) {
  if (!tokens) return true;
  let [settings] = await database.select().from(schema.aiSettings).where(eq(schema.aiSettings.organizationId, organizationId)).limit(1);
  if (!settings) [settings] = await database.insert(schema.aiSettings).values({ organizationId }).returning();
  const [updated] = await database.update(schema.aiSettings).set({
    usedTokens: sql`${schema.aiSettings.usedTokens} + ${tokens}`,
    updatedAt: new Date(),
  }).where(and(
    eq(schema.aiSettings.id, settings.id),
    eq(schema.aiSettings.organizationId, organizationId),
    sql`${schema.aiSettings.usedTokens} + ${tokens} <= ${schema.aiSettings.budgetTokens}`,
  )).returning({ id: schema.aiSettings.id });
  return Boolean(updated);
}

async function generateRegularProjectSummaries() {
  const cutoff = new Date(Date.now() - 20 * 60 * 60 * 1000);
  const rows = await database.select().from(schema.projectAiSummarySettings).where(and(
    eq(schema.projectAiSummarySettings.regularUpdates, true),
    sql`(${schema.projectAiSummarySettings.generatedAt} is null or ${schema.projectAiSummarySettings.generatedAt} < ${cutoff})`,
  ));
  let generated = 0, skipped = 0;
  for (const pref of rows) {
    const [flag] = await database.select({ enabled: schema.featureFlags.enabled }).from(schema.featureFlags).where(and(
      eq(schema.featureFlags.organizationId, pref.organizationId),
      eq(schema.featureFlags.key, "module:ai"),
    )).limit(1);
    if (!flag?.enabled) { skipped += 1; continue; }
    const [project] = await database.select().from(schema.projects).where(and(
      eq(schema.projects.organizationId, pref.organizationId),
      eq(schema.projects.id, pref.projectId),
      isNull(schema.projects.deletedAt),
    )).limit(1);
    if (!project) { skipped += 1; continue; }
    const tasks = await database.select({ key: schema.workItems.key, title: schema.workItems.title, statusCategory: schema.workItems.statusCategory, dueDate: schema.workItems.dueDate })
      .from(schema.workItems).where(and(eq(schema.workItems.organizationId, pref.organizationId), eq(schema.workItems.owningProjectId, pref.projectId), isNull(schema.workItems.deletedAt))).limit(300);
    const updates = await database.select().from(schema.projectStatusUpdates).where(and(eq(schema.projectStatusUpdates.organizationId, pref.organizationId), eq(schema.projectStatusUpdates.projectId, pref.projectId))).orderBy(desc(schema.projectStatusUpdates.createdAt)).limit(10);
    const done = tasks.filter((item) => item.statusCategory === "done").length;
    const overdue = tasks.filter((item) => item.dueDate && new Date(item.dueDate) < new Date() && item.statusCategory !== "done").length;
    const prompt = [
      `Project: ${project.name}`,
      `Description: ${project.description || "No description"}`,
      `Status: ${project.status}; health: ${project.health}`,
      `Tasks: ${tasks.length}; completed: ${done}; overdue: ${overdue}`,
      `Recent status updates: ${updates.map((u) => `${u.health}: ${u.title} ${u.body || ""}`).join(" | ") || "none"}`,
      pref.includeRiskReport ? `Risk facts: ${overdue} overdue tasks; project health ${project.health}.` : "",
      pref.includeSources ? `Sources: project record, ${tasks.length} current work items, ${updates.length} recent status updates.` : "",
      "Summarize current progress, next attention areas, and factual risks. Do not invent missing information.",
    ].filter(Boolean).join("\n");
    const fallback = `${project.name}: ${done} of ${tasks.length} tasks are complete; ${overdue} are overdue. Project health is ${project.health}. ${updates[0] ? `Latest update: ${updates[0].title}.` : "No status update has been posted yet."}`;
    const provider = await summarizeWithConfiguredProvider(prompt);
    const text = provider.text || fallback;
    if (!await consumeAiTokens(pref.organizationId, provider.tokens)) { skipped += 1; continue; }
    await database.update(schema.projectAiSummarySettings).set({ summary: text, generatedAt: new Date(), generatedBy: null, updatedAt: new Date() }).where(and(
      eq(schema.projectAiSummarySettings.id, pref.id),
      eq(schema.projectAiSummarySettings.organizationId, pref.organizationId),
    ));
    await database.insert(schema.aiAuditLog).values({ organizationId: pref.organizationId, userId: null, event: "project_summary_regular", detail: { projectId: pref.projectId, degraded: provider.degraded, tokens: provider.tokens } });
    generated += 1;
  }
  return { candidates: rows.length, generated, skipped };
}

async function purgeAllRetention() {
  const policies = await database.select({ organizationId: schema.retentionPolicies.organizationId })
    .from(schema.retentionPolicies)
    .where(eq(schema.retentionPolicies.autoPurge, true));
  const orgIds = [...new Set(policies.map((row) => row.organizationId))];
  const results = [];
  for (const organizationId of orgIds) results.push(await purgeOrgRetention(organizationId));
  return { organizations: results.length, purged: results.reduce((sum, row) => sum + row.purged, 0), results };
}

const worker = new Worker(
  QUEUE,
  async (job) => {
    const original = job.data as ScopedJob<Record<string, unknown>>;
    // Repeat occurrences share producer data, but BullMQ assigns a stable id per
    // occurrence. Fold it into the key so retries dedupe while future hours run.
    const recurring = job.name === "retention-auto-purge" || job.name === "ai-project-summary-regular";
    const data = recurring ? { ...original, idempotencyKey: `${original.idempotencyKey}:${job.id}` } : original;

    return runIdempotent(data, async (payload) => {
      if (job.name === "retention-auto-purge") return purgeAllRetention();
      if (job.name === "ai-project-summary-regular") return generateRegularProjectSummaries();
      if (job.name === "retention-purge") {
        const organizationId = String(payload.organizationId ?? data.organizationId ?? "");
        if (!organizationId || organizationId !== data.organizationId) throw new Error("Retention job organization scope mismatch");
        return purgeOrgRetention(organizationId);
      }
      if (job.name === "ping") return { pong: true, at: new Date().toISOString() };
      throw new Error(`Unknown job: ${job.name}`);
    });
  },
  { connection, concurrency: 4 },
);

// Exhausted retries -> dead-letter for inspection (no silent loss).
const events = new QueueEvents(QUEUE, { connection });
worker.on("failed", async (job, err) => {
  console.error(`[worker] failed ${job?.id}: ${err.message}`);
  if (job && job.attemptsMade >= (job.opts.attempts ?? 1)) {
    await deadLetter.add(job.name, { original: job.data, error: err.message });
    console.warn(`[worker] dead-lettered ${job.id}`);
  }
});
worker.on("completed", (job) => console.log(`[worker] completed ${job.id} (${job.name})`));
console.log("[worker] listening:", QUEUE);

/** Health probe: the worker has no product HTTP API; expose readiness only. */
const HEALTH_PORT = Number(process.env.WORKER_HEALTH_PORT ?? 4100);
const healthServer = createServer((req, res) => {
  if (req.url !== "/healthz") { res.writeHead(404).end(); return; }
  const ready = connection.status === "ready" && !worker.closing;
  res.writeHead(ready ? 200 : 503, { "content-type": "application/json" });
  res.end(JSON.stringify({ status: ready ? "ok" : "unavailable", service: "worker", redis: connection.status, time: new Date().toISOString() }));
});
healthServer.listen(HEALTH_PORT, "0.0.0.0", () => console.log(`[worker] health on :${HEALTH_PORT}/healthz`));

for (const sig of ["SIGINT", "SIGTERM"] as const) {
  process.on(sig, async () => {
    console.log(`[worker] ${sig}, draining...`);
    healthServer.close();
    await worker.close();
    await events.close();
    await systemQueue.close();
    await deadLetter.close();
    await connection.quit();
    process.exit(0);
  });
}
