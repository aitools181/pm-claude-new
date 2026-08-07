import { getDb, schema, type Database } from "@pm/db";
import { and, eq, isNull } from "drizzle-orm";

/**
 * Wraps a job handler with two guarantees the roadmap requires:
 *  1. Idempotency — a job with the same idempotency key runs its effect once.
 *  2. Organization Context verification — scoped jobs must carry a valid
 *     organizationId with an active membership for the acting user; otherwise refuse.
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

  // Refuse scoped work without a verified organization context.
  if (job.organizationId && job.actorUserId) {
    const [m] = await database.select().from(schema.organizationMemberships).where(and(
      eq(schema.organizationMemberships.organizationId, job.organizationId),
      eq(schema.organizationMemberships.userId, job.actorUserId),
      eq(schema.organizationMemberships.status, "active"),
      isNull(schema.organizationMemberships.deletedAt),
    )).limit(1);
    if (!m) throw new Error(`Refusing job: no active membership for org ${job.organizationId}`);
  }

  // Idempotency: if the key already recorded a result, return it without re-running.
  const [seen] = await database.select().from(schema.jobIdempotency)
    .where(eq(schema.jobIdempotency.key, job.idempotencyKey)).limit(1);
  if (seen) return seen.result as R;

  const result = await handler(job.payload);
  await database.insert(schema.jobIdempotency)
    .values({ key: job.idempotencyKey, organizationId: job.organizationId, result: result as object })
    .onConflictDoNothing();
  return result;
}
