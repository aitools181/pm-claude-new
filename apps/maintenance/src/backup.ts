import { eq } from "drizzle-orm";
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { getDb, schema } from "@pm/db";
import { sha256File } from "./checksum.js";
import { writeManifest, type Artifact } from "./manifest.js";
import { exportObjects } from "./storage.js";

/**
 * Manual, verifiable backup: database (pg_dump) + object storage + configuration.
 * Produces a manifest with a sha256 for every artifact and records history.
 */
export async function runBackup(opts: { outRoot: string; note?: string; operator?: string }) {
  const db = getDb(process.env.DATABASE_URL!);
  const [run] = await db.insert(schema.backupRuns).values({ note: opts.note, createdBy: opts.operator ?? "cli" }).returning();
  const dir = join(opts.outRoot, run.id);
  mkdirSync(dir, { recursive: true });
  const artifacts: Artifact[] = [];

  try {
    // 1) Database dump (custom format, restorable with pg_restore).
    const dumpPath = join(dir, "database.dump");
    execFileSync("pg_dump", ["--format=custom", "--no-owner", "--file", dumpPath, process.env.DATABASE_URL!], { stdio: "inherit" });
    artifacts.push({ kind: "database", path: "database.dump", ...(await sha256File(dumpPath)) });

    // 2) Object storage export.
    const bucket = process.env.S3_BUCKET!;
    const objDir = join(dir, "objects");
    const keys = await exportObjects(bucket, "", objDir);
    const objIndex = join(dir, "objects.index.json");
    writeFileSync(objIndex, JSON.stringify({ bucket, keys }, null, 2));
    artifacts.push({ kind: "objects", path: "objects.index.json", ...(await sha256File(objIndex)) });

    // 3) Configuration export (feature flags + org settings).
    const flags = await db.select().from(schema.featureFlags);
    const settings = await db.select().from(schema.organizationSettings);
    const cfgPath = join(dir, "config.json");
    writeFileSync(cfgPath, JSON.stringify({ featureFlags: flags, organizationSettings: settings }, null, 2));
    artifacts.push({ kind: "config", path: "config.json", ...(await sha256File(cfgPath)) });

    // 4) Manifest + reconcile records.
    const manifestPath = join(dir, "manifest.json");
    writeManifest(manifestPath, {
      version: 1, backupId: run.id, createdAt: new Date().toISOString(),
      databaseName: new URL(process.env.DATABASE_URL!).pathname.slice(1),
      objectNamespace: bucket, artifacts,
    });
    for (const a of artifacts) {
      await db.insert(schema.backupArtifacts).values({ backupRunId: run.id, kind: a.kind, path: a.path, sha256: a.sha256, bytes: a.bytes });
    }
    await db.update(schema.backupRuns).set({ status: "completed", completedAt: new Date(), manifestPath }).where(eq(schema.backupRuns.id, run.id));
    console.log(`[backup] completed ${run.id} → ${manifestPath}`);
    return { backupRunId: run.id, dir, manifestPath };
  } catch (e) {
    await db.update(schema.backupRuns).set({ status: "failed", completedAt: new Date() }).where(eq(schema.backupRuns.id, run.id));
    throw e;
  }
}
