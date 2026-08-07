import { Injectable, Inject } from "@nestjs/common";
import { eq, sql } from "drizzle-orm";
import { schema, type Database } from "@pm/db";
import { DB } from "../db/db.module.js";
import { ApiTokenService } from "../api/api-token.service.js";
import { WebhookService } from "../webhooks/webhook.service.js";
import { IntegrationService } from "../integrations/integration.service.js";
import { findSensitiveKey } from "./sensitive-fields.js";

export type Severity = "critical" | "high" | "medium";
export type Finding = { id: string; area: string; severity: Severity; ok: boolean; detail: string };

@Injectable()
export class SecurityAuditService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly apiTokens: ApiTokenService,
    private readonly webhooks: WebhookService,
    private readonly integrations: IntegrationService,
  ) {}

  private exposure(id: string, area: string, data: unknown): Finding {
    const leak = findSensitiveKey(data);
    return { id, area, severity: "critical", ok: !leak, detail: leak ? `response exposes sensitive field "${leak}"` : "no sensitive fields exposed" };
  }

  /** Run the security self-audit for an organization; passes with zero critical/high findings. */
  async run(organizationId: string): Promise<{ organizationId: string; findings: Finding[]; criticalHigh: number; passed: boolean }> {
    const findings: Finding[] = [];

    // 1. field-exposure across credential-bearing surfaces
    findings.push(this.exposure("expose-api-tokens", "api-tokens", await this.apiTokens.list(organizationId)));
    findings.push(this.exposure("expose-webhooks", "webhooks", await this.webhooks.list(organizationId)));
    findings.push(this.exposure("expose-integrations", "integrations", await this.integrations.list(organizationId)));

    // 2. credential storage invariants — tokens stored as 64-char hashes, never plaintext
    const tokens = await this.db.select().from(schema.apiTokens).where(eq(schema.apiTokens.organizationId, organizationId));
    const badToken = tokens.find((t) => t.tokenHash.length !== 64 || t.tokenHash.startsWith("pmk_") || !t.prefix);
    findings.push({ id: "store-token-hash", area: "api-tokens", severity: "high", ok: !badToken, detail: badToken ? "a token is not stored as a hash" : `${tokens.length} token(s) stored hashed` });

    // 3. integration credentials stored as ciphertext, never plaintext hint
    const creds = await this.db.select().from(schema.integrationCredentials).where(eq(schema.integrationCredentials.organizationId, organizationId));
    const badCred = creds.find((c) => !c.ciphertext || c.ciphertext.length < 24 || c.ciphertext === c.hint);
    findings.push({ id: "store-credential-ciphertext", area: "integrations", severity: "high", ok: !badCred, detail: badCred ? "a credential is not encrypted" : `${creds.length} credential(s) encrypted` });

    // 4. tenant integrity — no work item may belong to a project in another org (IDOR surface)
    const res = await this.db.execute(sql`
      SELECT count(*)::int AS mismatches FROM work_items w
      JOIN projects p ON p.id = w.owning_project_id
      WHERE w.organization_id <> p.organization_id
    `);
    const mismatches = Number((res.rows?.[0] as { mismatches?: number } | undefined)?.mismatches ?? 0);
    findings.push({ id: "tenant-integrity", area: "multi-tenancy", severity: "critical", ok: mismatches === 0, detail: mismatches === 0 ? "no cross-tenant work items" : `${mismatches} cross-tenant work item(s)` });

    const criticalHigh = findings.filter((f) => !f.ok && (f.severity === "critical" || f.severity === "high")).length;
    return { organizationId, findings, criticalHigh, passed: criticalHigh === 0 };
  }
}
