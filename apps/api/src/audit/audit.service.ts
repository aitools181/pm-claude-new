import { Injectable, Inject } from "@nestjs/common";
import { and, eq, desc } from "drizzle-orm";
import { schema, type Database } from "@pm/db";
import { DB } from "../db/db.module.js";

type AppendInput = {
  action: string;
  actorUserId?: string | null;
  correlationId?: string | null;
  targetType?: string; targetId?: string;
  metadata?: Record<string, unknown>;
} & ( { scopeType: "instance"; organizationId?: null } | { scopeType: "organization"; organizationId: string } );

/** Append-only. No update/delete surface is exposed anywhere in the app. */
@Injectable()
export class AuditService {
  constructor(@Inject(DB) private readonly db: Database) {}

  async append(e: AppendInput) {
    await this.db.insert(schema.auditEvents).values({
      scopeType: e.scopeType,
      organizationId: e.scopeType === "organization" ? e.organizationId : null,
      actorUserId: e.actorUserId ?? null,
      action: e.action,
      targetType: e.targetType, targetId: e.targetId,
      correlationId: e.correlationId ?? null,
      metadata: e.metadata,
    });
  }

  /** Organization-scoped read (privileged: AUDIT_READ within the org). */
  listForOrg(organizationId: string, limit = 100) {
    return this.db.select().from(schema.auditEvents)
      .where(and(eq(schema.auditEvents.scopeType, "organization"), eq(schema.auditEvents.organizationId, organizationId)))
      .orderBy(desc(schema.auditEvents.createdAt)).limit(limit);
  }

  /** Instance-scoped read (Super Administrator only — enforced in controller). */
  listInstance(limit = 100) {
    return this.db.select().from(schema.auditEvents)
      .where(eq(schema.auditEvents.scopeType, "instance"))
      .orderBy(desc(schema.auditEvents.createdAt)).limit(limit);
  }
}
