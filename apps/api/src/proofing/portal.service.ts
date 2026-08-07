import { Injectable, Inject } from "@nestjs/common";
import { and, asc, desc, eq } from "drizzle-orm";
import { schema, type Database } from "@pm/db";
import { AppError } from "@pm/shared";
import { DB } from "../db/db.module.js";

@Injectable()
export class PortalService {
  constructor(@Inject(DB) private readonly db: Database) {}

  private async latestByRef(ref: string) {
    const [sub] = await this.db.select().from(schema.formSubmissions).where(eq(schema.formSubmissions.requesterRef, ref)).orderBy(desc(schema.formSubmissions.createdAt)).limit(1);
    return sub ?? null;
  }

  /** Public: requester's request thread (submissions + conversation). */
  async publicThread(ref: string) {
    const subs = await this.db.select({ id: schema.formSubmissions.id, status: schema.formSubmissions.status, createdAt: schema.formSubmissions.createdAt }).from(schema.formSubmissions).where(eq(schema.formSubmissions.requesterRef, ref)).orderBy(asc(schema.formSubmissions.createdAt));
    const latest = subs[subs.length - 1];
    const messages = latest ? await this.db.select({ id: schema.submissionMessages.id, authorKind: schema.submissionMessages.authorKind, body: schema.submissionMessages.body, at: schema.submissionMessages.at }).from(schema.submissionMessages).where(eq(schema.submissionMessages.submissionId, latest.id)).orderBy(asc(schema.submissionMessages.at)) : [];
    return { submissions: subs, messages };
  }
  async publicPostMessage(ref: string, body: string) {
    const sub = await this.latestByRef(ref);
    if (!sub) throw new AppError("NOT_FOUND", "Request not found");
    const [m] = await this.db.insert(schema.submissionMessages).values({ organizationId: sub.organizationId, submissionId: sub.id, authorKind: "requester", body }).returning();
    return { id: m.id, at: m.at };
  }

  /** Internal (agent): thread + reply on a submission. */
  thread(organizationId: string, submissionId: string) {
    return this.db.select().from(schema.submissionMessages).where(and(eq(schema.submissionMessages.organizationId, organizationId), eq(schema.submissionMessages.submissionId, submissionId))).orderBy(asc(schema.submissionMessages.at));
  }
  async agentPostMessage(organizationId: string, userId: string, submissionId: string, body: string) {
    const [sub] = await this.db.select().from(schema.formSubmissions).where(and(eq(schema.formSubmissions.id, submissionId), eq(schema.formSubmissions.organizationId, organizationId))).limit(1);
    if (!sub) throw new AppError("NOT_FOUND", "Submission not found");
    return this.db.insert(schema.submissionMessages).values({ organizationId, submissionId, authorKind: "agent", authorUserId: userId, body }).returning().then((r) => r[0]);
  }
}
