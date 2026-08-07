import { Worker, Queue, QueueEvents } from "bullmq";
import { Redis } from "ioredis";
import { runIdempotent, type ScopedJob } from "./job-runner.js";

const connection = new Redis(process.env.REDIS_URL ?? "redis://localhost:6379", { maxRetriesPerRequest: null });

const QUEUE = "system";
const DLQ = "system-dead";
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

const worker = new Worker(
  QUEUE,
  async (job) => {
    const data = job.data as ScopedJob<Record<string, unknown>>;
    return runIdempotent(data, async (payload) => {
      if (job.name === "ping") return { pong: true, at: new Date().toISOString() };
      if (job.name === "noop") return { ok: true, payload };
      throw new Error(`Unknown job: ${job.name}`);
    });
  },
  { connection, concurrency: 4 },
);

// Exhausted retries → dead-letter for inspection (no silent loss).
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

for (const sig of ["SIGINT", "SIGTERM"] as const) {
  process.on(sig, async () => {
    console.log(`[worker] ${sig}, draining...`);
    await worker.close(); await events.close(); await connection.quit();
    process.exit(0);
  });
}
