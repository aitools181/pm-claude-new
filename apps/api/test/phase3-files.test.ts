import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "testcontainers";
import { getDb, schema } from "@pm/db";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { WorkspacesService } from "../src/work/workspaces.service.js";
import { ProjectsService } from "../src/work/projects.service.js";
import { WorkItemsService } from "../src/work/work-items.service.js";
import { FilesService } from "../src/files/files.service.js";
import { sha256 } from "../src/common/crypto.js";
import { eq } from "drizzle-orm";
import { AppError } from "@pm/shared";

let pg: StartedPostgreSqlContainer;
let db: ReturnType<typeof getDb>;
let files: FilesService, ws: WorkspacesService, projects: ProjectsService, items: WorkItemsService;
let orgA: string, orgB: string, userA: string, userB: string, outsider: string;
let versionId: string, privateVersionId: string;

const BODY = "hello world"; const BODY_SHA = sha256(BODY);

async function bootstrap(slug: string) {
  const [u] = await db.insert(schema.users).values({ email: `${slug}@x.io`, displayName: slug }).returning();
  const [o] = await db.insert(schema.organizations).values({ name: slug, slug }).returning();
  await db.insert(schema.organizationMemberships).values({ organizationId: o.id, userId: u.id });
  await db.insert(schema.workItemTypes).values([{ organizationId: o.id, key: "task", name: "Task" }, { organizationId: o.id, key: "subtask", name: "Subtask" }]);
  return { orgId: o.id, userId: u.id };
}
async function makeCleanVersion(orgId: string, userId: string, privacy: "workspace" | "private") {
  const w = await ws.create(orgId, userId, `ws-${privacy}-${Math.random()}`);
  const p = await projects.create(orgId, userId, { workspaceId: w.id, name: "P", keyPrefix: "P" + Math.floor(Math.random()*900), privacy });
  const item = await items.create(orgId, userId, { projectId: p.id, title: "with file" });
  const begun = await files.beginUpload(orgId, userId, item.id, { filename: "f.txt", contentType: "text/plain", bytes: BODY.length, sha256: BODY_SHA });
  await files.completeUpload(begun.versionId, { bytes: BODY.length, sha256: BODY_SHA });
  return { versionId: begun.versionId, projectId: p.id, workItemId: item.id };
}

beforeAll(async () => {
  pg = await new PostgreSqlContainer("postgres:18-alpine").start();
  db = getDb(pg.getConnectionUri());
  await migrate(db, { migrationsFolder: "../../packages/db/migrations" });
  files = new FilesService(db); ws = new WorkspacesService(db); projects = new ProjectsService(db); items = new WorkItemsService(db);
  const a = await bootstrap("org-a"); orgA = a.orgId; userA = a.userId;
  const b = await bootstrap("org-b"); orgB = b.orgId; userB = b.userId;
  const out = await db.insert(schema.users).values({ email: "out@x.io", displayName: "out" }).returning();
  outsider = out[0].id; await db.insert(schema.organizationMemberships).values({ organizationId: orgA, userId: outsider });

  versionId = (await makeCleanVersion(orgA, userA, "workspace")).versionId;
  privateVersionId = (await makeCleanVersion(orgA, userA, "private")).versionId;
});
afterAll(async () => { await pg?.stop(); });

describe("Phase 3 — Download Grants", () => {
  it("is single-use: a grant works once, then is rejected", async () => {
    const token = await files.createDownloadGrant(orgA, userA, versionId);
    await expect(files.consumeGrant(token, "download", orgA, userA)).resolves.toBeDefined();
    await expect(files.consumeGrant(token, "download", orgA, userA)).rejects.toBeInstanceOf(AppError);
  });

  it("is short-lived: an expired grant cannot be used", async () => {
    const raw = "expired-token-xyz";
    await db.insert(schema.downloadGrants).values({
      organizationId: orgA, versionId, purpose: "download", tokenHash: sha256(raw),
      expiresAt: new Date(Date.now() - 1000), createdBy: userA,
    });
    await expect(files.consumeGrant(raw, "download", orgA, userA)).rejects.toBeInstanceOf(AppError);
  });

  it("cannot be redeemed from another organization", async () => {
    const token = await files.createDownloadGrant(orgA, userA, versionId);
    await expect(files.consumeGrant(token, "download", orgB, userB)).rejects.toBeInstanceOf(AppError);
  });

  it("refuses a grant for a file the user cannot access (private project non-member)", async () => {
    await expect(files.createDownloadGrant(orgA, outsider, privateVersionId)).rejects.toBeInstanceOf(AppError);
  });

  it("re-checks access at redeem time", async () => {
    // A valid grant issued to a member; a non-member cannot redeem it even with the raw token.
    const token = await files.createDownloadGrant(orgA, userA, privateVersionId);
    await expect(files.consumeGrant(token, "download", orgA, outsider)).rejects.toBeInstanceOf(AppError);
  });
});

describe("Phase 3 — upload safety", () => {
  it("rejects an oversized upload", async () => {
    const w = await ws.create(orgA, userA, "big-ws");
    const p = await projects.create(orgA, userA, { workspaceId: w.id, name: "Big", keyPrefix: "BIG" });
    const item = await items.create(orgA, userA, { projectId: p.id, title: "big" });
    await expect(files.beginUpload(orgA, userA, item.id, { filename: "big.bin", contentType: "application/octet-stream", bytes: 999_999_999_999, sha256: BODY_SHA }))
      .rejects.toBeInstanceOf(AppError);
  });

  it("quarantines a version whose bytes/checksum do not match", async () => {
    const w = await ws.create(orgA, userA, "chk-ws");
    const p = await projects.create(orgA, userA, { workspaceId: w.id, name: "Chk", keyPrefix: "CHK" });
    const item = await items.create(orgA, userA, { projectId: p.id, title: "chk" });
    const begun = await files.beginUpload(orgA, userA, item.id, { filename: "c.txt", contentType: "text/plain", bytes: BODY.length, sha256: BODY_SHA });
    await expect(files.completeUpload(begun.versionId, { bytes: 3, sha256: "deadbeef" })).rejects.toBeInstanceOf(AppError);
    const [v] = await db.select().from(schema.attachmentVersions).where(eq(schema.attachmentVersions.id, begun.versionId));
    expect(v.status).toBe("infected");
  });
});
