import { createServer } from "node:http";
import { Worker, Queue, QueueEvents } from "bullmq";
import { and, eq, isNotNull, lt } from "drizzle-orm";
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
    const data = job.name === "retention-auto-purge"
      ? { ...original, idempotencyKey: `${original.idempotencyKey}:${job.id}` }
      : original;

    return runIdempotent(data, async (payload) => {
      if (job.name === "retention-auto-purge") return purgeAllRetention();
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
