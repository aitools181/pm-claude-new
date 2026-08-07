import { Injectable, Inject } from "@nestjs/common";
import { and, desc, eq } from "drizzle-orm";
import { randomBytes } from "node:crypto";
import { schema, type Database } from "@pm/db";
import { AppError } from "@pm/shared";
import { DB } from "../db/db.module.js";
import { WorkItemsService } from "../work/work-items.service.js";
import { RateLimiter, CAPTCHA, type CaptchaVerifier } from "./public-guards.js";
import { missingRequired, selectRoute, interpolate, type FormField, type RoutingRule, type Answers } from "./form-logic.js";

const PUBLIC_LIMIT = 5, PUBLIC_WINDOW_MS = 60_000;

@Injectable()
export class SubmissionsService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly items: WorkItemsService,
    private readonly rate: RateLimiter,
    @Inject(CAPTCHA) private readonly captcha: CaptchaVerifier,
  ) {}

  private async currentVersion(organizationId: string, form: typeof schema.forms.$inferSelect) {
    if (!form.currentVersionId) throw new AppError("CONFLICT", "Form is not published");
    const [v] = await this.db.select().from(schema.formVersions).where(eq(schema.formVersions.id, form.currentVersionId)).limit(1);
    if (!v) throw new AppError("NOT_FOUND", "Form version not found");
    return v;
  }

  /** Core: validate visible-required, route to a work item, persist the submission. */
  private async submit(organizationId: string, form: typeof schema.forms.$inferSelect, version: typeof schema.formVersions.$inferSelect, answers: Answers, ctx: { source: string; userId?: string; ip?: string; requesterRef?: string }) {
    const fields = version.fields as FormField[];
    const missing = missingRequired(fields, answers);
    if (missing.length) throw new AppError("VALIDATION", `Missing required fields: ${missing.join(", ")}`, { code: "missing_fields", missing });

    const route = selectRoute(version.routing as RoutingRule[], answers, { projectId: version.defaultProjectId ?? undefined, typeId: version.defaultTypeId ?? undefined });
    let workItemId: string | null = null, status = "failed";
    if (route?.projectId) {
      const title = (route.titleTemplate ? interpolate(route.titleTemplate, answers) : `${form.name} request`).slice(0, 500) || `${form.name} request`;
      const description = fields.map((f) => `${f.label}: ${answers[f.key] ?? ""}`).join("\n");
      const actor = ctx.userId ?? form.createdByUserId;
      const item = await this.items.create(organizationId, actor, { projectId: route.projectId, title, description });
      workItemId = item.id; status = "routed";
    }
    const [sub] = await this.db.insert(schema.formSubmissions).values({
      organizationId, formId: form.id, versionId: version.id, source: ctx.source,
      submittedByUserId: ctx.userId ?? null, answers, createdWorkItemId: workItemId, status,
      requesterRef: ctx.requesterRef ?? null, ip: ctx.ip ?? null,
    }).returning();
    return { submissionId: sub.id, workItemId, status, requesterRef: ctx.requesterRef };
  }

  async submitInternal(organizationId: string, userId: string, formId: string, answers: Answers) {
    const [form] = await this.db.select().from(schema.forms).where(and(eq(schema.forms.id, formId), eq(schema.forms.organizationId, organizationId))).limit(1);
    if (!form) throw new AppError("NOT_FOUND", "Form not found");
    const version = await this.currentVersion(organizationId, form);
    return this.submit(organizationId, form, version, answers, { source: "internal", userId });
  }

  async submitPublic(token: string, answers: Answers, ip: string, captchaToken?: string) {
    if (!this.rate.check(`${token}:${ip}`, PUBLIC_LIMIT, PUBLIC_WINDOW_MS)) throw new AppError("RATE_LIMITED", "Too many submissions, please wait");
    if (!(await this.captcha.verify(captchaToken))) throw new AppError("FORBIDDEN", "CAPTCHA verification failed");
    const [form] = await this.db.select().from(schema.forms).where(and(eq(schema.forms.publicToken, token), eq(schema.forms.publicEnabled, true))).limit(1);
    if (!form) throw new AppError("NOT_FOUND", "Form not available");
    const version = await this.currentVersion(form.organizationId, form);
    const requesterRef = randomBytes(16).toString("base64url");
    return this.submit(form.organizationId, form, version, answers, { source: "public", ip, requesterRef });
  }

  list(organizationId: string, formId: string) {
    return this.db.select().from(schema.formSubmissions)
      .where(and(eq(schema.formSubmissions.organizationId, organizationId), eq(schema.formSubmissions.formId, formId)))
      .orderBy(desc(schema.formSubmissions.createdAt));
  }

  /** Requester portal: only submissions matching the opaque ref (IDOR-safe). */
  byRequester(requesterRef: string) {
    if (!requesterRef) throw new AppError("VALIDATION", "Missing ref");
    return this.db.select({ id: schema.formSubmissions.id, status: schema.formSubmissions.status, createdAt: schema.formSubmissions.createdAt, workItemId: schema.formSubmissions.createdWorkItemId })
      .from(schema.formSubmissions).where(eq(schema.formSubmissions.requesterRef, requesterRef));
  }
}
