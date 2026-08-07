import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "testcontainers";
import { getDb, schema } from "@pm/db";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { eq } from "drizzle-orm";
import { IntegrationService } from "../src/integrations/integration.service.js";
import { encryptSecret, decryptSecret, deriveKey } from "../src/integrations/crypto.js";

describe("Phase 11 — credential vault crypto (pure)", () => {
  it("round-trips and rejects tampering", () => {
    const key = deriveKey("s".repeat(40));
    const ct = encryptSecret("supersecret-1234", key);
    expect(decryptSecret(ct, key)).toBe("supersecret-1234");
    expect(ct.includes("supersecret")).toBe(false);
    const b = Buffer.from(ct, "base64"); b[28] ^= 0xff;
    expect(() => decryptSecret(b.toString("base64"), key)).toThrow();
  });
});

describe("Phase 11 — integrations (DB)", () => {
  let pg: StartedPostgreSqlContainer, db: ReturnType<typeof getDb>;
  let svc: IntegrationService, org: string, u: string;

  beforeAll(async () => {
    pg = await new PostgreSqlContainer("postgres:18-alpine").start();
    db = getDb(pg.getConnectionUri());
    await migrate(db, { migrationsFolder: "../../packages/db/migrations" });
    svc = new IntegrationService(db, { SESSION_SECRET: "s".repeat(40) } as any);
    const [o] = await db.insert(schema.organizations).values({ name: "O", slug: "o" }).returning(); org = o.id;
    const [a] = await db.insert(schema.users).values({ email: "u@x.io", displayName: "u" }).returning(); u = a.id;
    await db.insert(schema.organizationMemberships).values({ organizationId: org, userId: u });
  }, 120_000);
  afterAll(async () => { await pg?.stop(); });

  it("stores credentials encrypted, never returns plaintext, and health-checks", async () => {
    const integ = await svc.create(org, u, { kind: "github", name: "GH", secret: "ghp_supersecret-1234" });
    expect(integ.credentialHint).toBe("••••1234");
    expect(integ).not.toHaveProperty("secret");
    const [cred] = await db.select().from(schema.integrationCredentials).where(eq(schema.integrationCredentials.integrationId, integ.id));
    expect(cred.ciphertext.includes("supersecret")).toBe(false);
    expect((await svc.list(org))[0]).not.toHaveProperty("ciphertext");
    expect((await svc.runHealthCheck(org, integ.id)).ok).toBe(true);

    const noSecret = await svc.create(org, u, { kind: "email", name: "Mail" });
    const h = await svc.runHealthCheck(org, noSecret.id);
    expect(h.ok).toBe(false); expect(h.integration.status).toBe("error");

    const rot = await svc.rotateCredential(org, integ.id, "ghp_rotated-abcd");
    expect(rot.credentialHint).toBe("••••abcd");
    expect((await svc.runHealthCheck(org, integ.id)).ok).toBe(true);
  });
});
