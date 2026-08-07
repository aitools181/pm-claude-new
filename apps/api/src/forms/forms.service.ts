import { Injectable, Inject } from "@nestjs/common";
import { and, desc, eq, sql } from "drizzle-orm";
import { randomBytes } from "node:crypto";
import { schema, type Database } from "@pm/db";
import { AppError } from "@pm/shared";
import { DB } from "../db/db.module.js";
import type { FormField, RoutingRule } from "./form-logic.js";

@Injectable()
export class FormsService {
  constructor(@Inject(DB) private readonly db: Database) {}

  async create(organizationId: string, userId: string, input: { key: string; name: string; description?: string }) {
    const [f] = await this.db.insert(schema.forms).values({ organizationId, key: input.key, name: input.name, description: input.description ?? null, createdByUserId: userId }).returning();
    return f;
  }

  private async load(organizationId: string, id: string) {
    const [f] = await this.db.select().from(schema.forms).where(and(eq(schema.forms.id, id), eq(schema.forms.organizationId, organizationId))).limit(1);
    if (!f) throw new AppError("NOT_FOUND", "Form not found");
    return f;
  }

  list(organizationId: string) {
    return this.db.select().from(schema.forms).where(eq(schema.forms.organizationId, organizationId)).orderBy(desc(schema.forms.createdAt));
  }

  async get(organizationId: string, id: string) {
    const form = await this.load(organizationId, id);
    let version = null;
    if (form.currentVersionId) [version] = await this.db.select().from(schema.formVersions).where(eq(schema.formVersions.id, form.currentVersionId)).limit(1);
    return { form, version };
  }

  async updateDraft(organizationId: string, id: string, patch: { name?: string; description?: string; draftFields?: FormField[]; draftRouting?: RoutingRule[]; defaultProjectId?: string | null; defaultTypeId?: string | null }) {
    const form = await this.load(organizationId, id);
    if (form.status === "archived") throw new AppError("CONFLICT", "Form is archived");
    if (patch.draftFields) {
      const keys = patch.draftFields.map((f) => f.key);
      if (new Set(keys).size !== keys.length) throw new AppError("VALIDATION", "Duplicate field keys");
    }
    const [row] = await this.db.update(schema.forms).set({ ...patch }).where(eq(schema.forms.id, id)).returning();
    return row;
  }

  /** Snapshot the draft into a new immutable version and publish it. */
  async publish(organizationId: string, userId: string, id: string) {
    const form = await this.load(organizationId, id);
    const fields = form.draftFields as FormField[];
    if (!fields.length) throw new AppError("VALIDATION", "Form has no fields");
    const [{ max }] = await this.db.select({ max: sql<number>`coalesce(max(${schema.formVersions.version}),0)::int` }).from(schema.formVersions).where(eq(schema.formVersions.formId, id));
    const nextVersion = (max ?? 0) + 1;
    const [version] = await this.db.transaction(async (tx) => {
      const [v] = await tx.insert(schema.formVersions).values({
        organizationId, formId: id, version: nextVersion, fields, routing: form.draftRouting,
        defaultProjectId: form.defaultProjectId, defaultTypeId: form.defaultTypeId, publishedByUserId: userId,
      }).returning();
      await tx.update(schema.forms).set({ status: "published", currentVersionId: v.id }).where(eq(schema.forms.id, id));
      return [v];
    });
    return version;
  }

  async enablePublic(organizationId: string, id: string) {
    const form = await this.load(organizationId, id);
    if (form.status !== "published") throw new AppError("CONFLICT", "Publish the form before enabling public access");
    const token = form.publicToken ?? randomBytes(18).toString("base64url");
    const [row] = await this.db.update(schema.forms).set({ publicEnabled: true, publicToken: token }).where(eq(schema.forms.id, id)).returning();
    return { publicToken: row.publicToken, publicEnabled: true };
  }
  async disablePublic(organizationId: string, id: string) {
    await this.load(organizationId, id);
    await this.db.update(schema.forms).set({ publicEnabled: false }).where(eq(schema.forms.id, id));
    return { publicEnabled: false };
  }

  /** Public-safe view: only the field schema, no routing/internal metadata. */
  async getByPublicToken(token: string) {
    const [form] = await this.db.select().from(schema.forms).where(and(eq(schema.forms.publicToken, token), eq(schema.forms.publicEnabled, true))).limit(1);
    if (!form || !form.currentVersionId) throw new AppError("NOT_FOUND", "Form not available");
    const [version] = await this.db.select().from(schema.formVersions).where(eq(schema.formVersions.id, form.currentVersionId)).limit(1);
    return { formId: form.id, name: form.name, description: form.description, versionId: version.id, fields: version.fields };
  }
}
