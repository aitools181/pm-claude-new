import { getDb, schema, type Database } from "@pm/db";
import { and, eq, isNull, sql } from "drizzle-orm";

/**
 * Wrap a job handler with two guarantees:
 *  1. Organization context is complete and verified for user-scoped work.
 *  2. Concurrent deliveries for the same idempotency key are serialized by a
 *     PostgreSQL advisory transaction lock before the effect runs.
 *
 * The advisory lock fixes the previous race where two workers could both run
 * the effect before either inserted job_idempotency. External side-effects
 * should still use the same idempotency key with the downstream provider when
 * that provider supports it; no local database can make an arbitrary remote
 * API exactly-once across a process crash.
 */
export type ScopedJob<T> = {
  idempotencyKey: string;
  organizationId?: string;
  actorUserId?: string;
  payload: T;
};

let db: Database;
function getDatabase() { return (db ??= getDb(process.env.DATABASE_URL!)); }

export async function runIdempotent<T, R>(job: ScopedJob<T>, handler: (payload: T) => Promise<R>): Promise<R> {
  const database = getDatabase();

  if (Boolean(job.organizationId) !== Boolean(job.actorUserId)) {
    throw new Error("Refusing job: organizationId and actorUserId must be supplied together");
  }

  if (job.organizationId && job.actorUserId) {
    const [m] = await database.select().from(schema.organizationMemberships).where(and(
      eq(schema.organizationMemberships.organizationId, job.organizationId),
      eq(schema.organizationMemberships.userId, job.actorUserId),
      eq(schema.organizationMemberships.status, "active"),
      isNull(schema.organizationMemberships.deletedAt),
    )).limit(1);
    if (!m) throw new Error(`Refusing job: no active membership for org ${job.organizationId}`);
  }

  return database.transaction(async (tx) => {
    // hashtextextended gives a stable signed bigint key and xact lock is
    // automatically released on commit/rollback, including worker crashes.
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${job.idempotencyKey}, 0))`);

    const [seen] = await tx.select().from(schema.jobIdempotency)
      .where(eq(schema.jobIdempotency.key, job.idempotencyKey)).limit(1);
    if (seen) return seen.result as R;

    const result = await handler(job.payload);
    await tx.insert(schema.jobIdempotency)
      .values({ key: job.idempotencyKey, organizationId: job.organizationId, result: result as object });
    return result;
  });
}
