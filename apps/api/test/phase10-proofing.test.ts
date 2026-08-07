import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "testcontainers";
import { getDb, schema } from "@pm/db";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { ProofingService } from "../src/proofing/proofing.service.js";
import { PortalService } from "../src/proofing/portal.service.js";

describe("Phase 10 — proofing & portal (DB)", () => {
  let pg: StartedPostgreSqlContainer, db: ReturnType<typeof getDb>;
  let proof: ProofingService, portal: PortalService, org: string, u: string;

  beforeAll(async () => {
    pg = await new PostgreSqlContainer("postgres:18-alpine").start();
    db = getDb(pg.getConnectionUri());
    await migrate(db, { migrationsFolder: "../../packages/db/migrations" });
    proof = new ProofingService(db); portal = new PortalService(db);
    const [o] = await db.insert(schema.organizations).values({ name: "O", slug: "o" }).returning(); org = o.id;
    const [a] = await db.insert(schema.users).values({ email: "u@x.io", displayName: "u" }).returning(); u = a.id;
    await db.insert(schema.organizationMemberships).values({ organizationId: org, userId: u });
  }, 120_000);
  afterAll(async () => { await pg?.stop(); });

  it("pins markers to an immutable version and reapproves on asset update", async () => {
    const asset = await proof.createAsset(org, { name: "Banner", fileRef: "v1.png", reapprovalOnUpdate: true });
    await proof.addMarker(org, asset.id, u, { assetVersion: 1, x: 0.25, y: 0.5, comment: "fix" });
    await proof.submitReview(org, asset.id, u, { assetVersion: 1, status: "approved" });
    const av = await proof.addVersion(org, asset.id, { fileRef: "v2.png" });
    expect(av.reapprovalRequired).toBe(true);

    const mV1 = await proof.listMarkers(org, asset.id, 1);
    const mV2 = await proof.listMarkers(org, asset.id, 2);
    expect(mV1).toHaveLength(1);
    expect(mV1[0].x).toBe(0.25); expect(mV1[0].y).toBe(0.5); // marker stays on exact version + location
    expect(mV2).toHaveLength(0);
    expect((await proof.get(org, asset.id)).currentReview!.status).toBe("pending"); // reapproval required
  });

  it("carries the conversation thread between requester and agent", async () => {
    const [form] = await db.insert(schema.forms).values({ organizationId: org, key: "req", name: "Request", createdByUserId: u }).returning();
    const [fv] = await db.insert(schema.formVersions).values({ organizationId: org, formId: form.id, version: 1, fields: [], routing: [], publishedByUserId: u }).returning();
    const [sub] = await db.insert(schema.formSubmissions).values({ organizationId: org, formId: form.id, versionId: fv.id, answers: {}, requesterRef: "REF-1", source: "public" }).returning();
    await portal.publicPostMessage("REF-1", "When done?");
    await portal.agentPostMessage(org, u, sub.id, "Soon.");
    const pub = await portal.publicThread("REF-1");
    expect(pub.messages.map((m) => m.authorKind)).toEqual(["requester", "agent"]);
  });
});
