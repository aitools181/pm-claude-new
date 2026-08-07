import { CallHandler, ExecutionContext, Inject, Injectable, NestInterceptor } from "@nestjs/common";
import { and, eq } from "drizzle-orm";
import { firstValueFrom, from, type Observable } from "rxjs";
import { schema, type Database } from "@pm/db";
import { AppError } from "@pm/shared";
import { DB } from "../db/db.module.js";
import { sha256 } from "../common/crypto.js";

function stable(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stable(record[key])}`).join(",")}}`;
}

/**
 * Reserves the Idempotency-Key before executing a mutation. This closes the
 * double-click race: a concurrent retry sees an in-progress reservation rather
 * than executing the mutation a second time. Completed requests replay the
 * permission-projected response verbatim.
 */
@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  constructor(@Inject(DB) private readonly db: Database) {}

  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = ctx.switchToHttp().getRequest();
    const key = String(req.headers["idempotency-key"] ?? "").trim();
    if (!key || req.method === "GET" || req.method === "HEAD") return next.handle();
    if (key.length > 200) throw new AppError("VALIDATION", "Idempotency-Key is too long");
    return from(this.execute(req, key, next));
  }

  private async execute(req: any, key: string, next: CallHandler) {
    const organizationId = String(req.organizationId ?? "");
    if (!organizationId) throw new AppError("VALIDATION", "Organization context is required for an idempotent mutation");
    const path = String(req.route?.path ? `${req.baseUrl ?? ""}${req.route.path}` : (req.path ?? req.url));
    const requestHash = sha256(`${req.method}\n${path}\n${stable(req.body ?? null)}`);

    const [reservation] = await this.db.insert(schema.idempotencyKeys).values({
      organizationId,
      key,
      method: req.method,
      path,
      requestHash,
      statusCode: 102,
      responseBody: null,
    }).onConflictDoNothing().returning({ id: schema.idempotencyKeys.id });

    if (!reservation) {
      const [existing] = await this.db.select().from(schema.idempotencyKeys).where(and(
        eq(schema.idempotencyKeys.organizationId, organizationId),
        eq(schema.idempotencyKeys.key, key),
      )).limit(1);
      if (!existing) throw new AppError("CONFLICT", "Idempotency reservation changed; retry the request", { code: "WORK_ITEM_IDEMPOTENCY_RETRY" });
      if ((existing.requestHash && existing.requestHash !== requestHash) || existing.method !== req.method || existing.path !== path) {
        throw new AppError("CONFLICT", "Idempotency key was already used for a different request", { code: "WORK_ITEM_IDEMPOTENCY_CONFLICT" });
      }
      if (existing.statusCode === 102 || existing.responseBody == null) {
        throw new AppError("CONFLICT", "The original request is still being processed", { code: "WORK_ITEM_IDEMPOTENCY_IN_PROGRESS", retryable: true });
      }
      req.res?.status?.(existing.statusCode);
      req.res?.setHeader?.("Idempotent-Replayed", "true");
      return existing.responseBody;
    }

    try {
      const body = await firstValueFrom(next.handle());
      const statusCode = Number(req.res?.statusCode ?? 200);
      await this.db.update(schema.idempotencyKeys).set({ statusCode, responseBody: body as object }).where(eq(schema.idempotencyKeys.id, reservation.id));
      return body;
    } catch (error) {
      // A failed request may be corrected and retried with the same logical key.
      await this.db.delete(schema.idempotencyKeys).where(and(eq(schema.idempotencyKeys.id, reservation.id), eq(schema.idempotencyKeys.statusCode, 102)));
      throw error;
    }
  }
}
