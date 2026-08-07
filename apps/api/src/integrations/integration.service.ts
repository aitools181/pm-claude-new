import { Injectable, Inject, Optional } from "@nestjs/common";
import { and, eq } from "drizzle-orm";
import { schema, type Database } from "@pm/db";
import { AppError, type Env } from "@pm/shared";
import { DB } from "../db/db.module.js";
import { ENV } from "../config/config.module.js";
import { deriveKey, encryptSecret, decryptSecret } from "./crypto.js";
import { ADAPTER_REGISTRY, DEFAULT_ADAPTERS, type AdapterRegistry } from "./adapter.js";

const hint = (secret: string) => `••••${secret.slice(-4)}`;

@Injectable()
export class IntegrationService {
  private readonly key: Buffer;
  private readonly adapters: AdapterRegistry;
  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(ENV) env: Env,
    @Optional() @Inject(ADAPTER_REGISTRY) adapters?: AdapterRegistry,
  ) {
    this.key = deriveKey(env.SESSION_SECRET);
    this.adapters = adapters ?? DEFAULT_ADAPTERS;
  }

  // ---- credential vault (secrets never leave the server as plaintext) ----
  private async storeCredential(organizationId: string, integrationId: string, secret: string) {
    const ciphertext = encryptSecret(secret, this.key);
    const [existing] = await this.db.select().from(schema.integrationCredentials).where(eq(schema.integrationCredentials.integrationId, integrationId)).limit(1);
    if (existing) await this.db.update(schema.integrationCredentials).set({ ciphertext, hint: hint(secret) }).where(eq(schema.integrationCredentials.id, existing.id));
    else await this.db.insert(schema.integrationCredentials).values({ organizationId, integrationId, ciphertext, hint: hint(secret) });
  }
  /** SERVER-ONLY: decrypt for adapter use. Never exposed through any controller. */
  private async reveal(integrationId: string): Promise<string | null> {
    const [cred] = await this.db.select().from(schema.integrationCredentials).where(eq(schema.integrationCredentials.integrationId, integrationId)).limit(1);
    return cred ? decryptSecret(cred.ciphertext, this.key) : null;
  }
  private async credHint(integrationId: string) {
    const [cred] = await this.db.select({ hint: schema.integrationCredentials.hint }).from(schema.integrationCredentials).where(eq(schema.integrationCredentials.integrationId, integrationId)).limit(1);
    return cred?.hint ?? null;
  }


  /** SERVER-ONLY credential access for trusted integration modules. Never expose through controllers. */
  async getServerSecret(organizationId: string, integrationId: string): Promise<string | null> {
    await this.load(organizationId, integrationId);
    return this.reveal(integrationId);
  }

  /** SERVER-ONLY lookup used by signed inbound webhooks before Organization context exists. */
  async getServerContext(integrationId: string) {
    const [row] = await this.db.select().from(schema.integrations).where(eq(schema.integrations.id, integrationId)).limit(1);
    if (!row || row.status === "disconnected") throw new AppError("NOT_FOUND", "Active integration not found");
    const secret = await this.reveal(integrationId);
    if (!secret) throw new AppError("FORBIDDEN", "Integration credential is not configured");
    return { id: row.id, organizationId: row.organizationId, kind: row.kind, config: (row.config ?? {}) as Record<string, unknown>, secret };
  }

  // ---- integrations ----
  async create(organizationId: string, userId: string, input: { kind: string; name: string; config?: Record<string, unknown>; secret?: string }) {
    const [row] = await this.db.insert(schema.integrations).values({ organizationId, kind: input.kind, name: input.name, config: input.config ?? {}, createdByUserId: userId, healthStatus: "unknown" }).returning();
    if (input.secret) await this.storeCredential(organizationId, row.id, input.secret);
    return this.mask(row, input.secret ? hint(input.secret) : null);
  }

  private mask(row: typeof schema.integrations.$inferSelect, credentialHint: string | null) {
    return { id: row.id, kind: row.kind, name: row.name, status: row.status, config: row.config, healthStatus: row.healthStatus, healthDetail: row.healthDetail, lastHealthCheckAt: row.lastHealthCheckAt, credentialHint };
  }

  async list(organizationId: string) {
    const rows = await this.db.select().from(schema.integrations).where(eq(schema.integrations.organizationId, organizationId)).orderBy(schema.integrations.createdAt);
    const out = [];
    for (const r of rows) out.push(this.mask(r, await this.credHint(r.id)));
    return out;
  }
  private async load(organizationId: string, id: string) {
    const [row] = await this.db.select().from(schema.integrations).where(and(eq(schema.integrations.id, id), eq(schema.integrations.organizationId, organizationId))).limit(1);
    if (!row) throw new AppError("NOT_FOUND", "Integration not found");
    return row;
  }
  async get(organizationId: string, id: string) { const row = await this.load(organizationId, id); return this.mask(row, await this.credHint(id)); }

  async rotateCredential(organizationId: string, id: string, secret: string) {
    await this.load(organizationId, id);
    await this.storeCredential(organizationId, id, secret);
    return { rotated: true, credentialHint: hint(secret) };
  }
  async setStatus(organizationId: string, id: string, status: "connected" | "disconnected") {
    await this.load(organizationId, id);
    const [row] = await this.db.update(schema.integrations).set({ status }).where(eq(schema.integrations.id, id)).returning();
    return this.mask(row, await this.credHint(id));
  }

  /** Run the adapter's health check using the decrypted credential (server-side only). */
  async runHealthCheck(organizationId: string, id: string) {
    const row = await this.load(organizationId, id);
    const adapter = this.adapters[row.kind];
    if (!adapter) throw new AppError("VALIDATION", `No adapter for kind ${row.kind}`);
    const secret = await this.reveal(id);
    const res = await adapter.healthCheck((row.config as Record<string, unknown>) ?? {}, secret);
    const [updated] = await this.db.update(schema.integrations)
      .set({ healthStatus: res.ok ? "ok" : "failing", healthDetail: res.detail ?? null, lastHealthCheckAt: new Date(), status: res.ok ? row.status : "error" })
      .where(eq(schema.integrations.id, id)).returning();
    return { ok: res.ok, detail: res.detail, integration: this.mask(updated, await this.credHint(id)) };
  }
}
