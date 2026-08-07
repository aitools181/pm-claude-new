import { execFileSync } from "node:child_process";
import { join, dirname } from "node:path";
import { readFileSync } from "node:fs";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@pm/db";
import { readManifest } from "./manifest.js";
import { verifyBackup } from "./verify.js";
import { importObjects } from "./storage.js";

export class InPlaceRestoreRefused extends Error {}

/**
 * Restore ALWAYS into an isolated database + isolated object namespace.
 * Guards enforce the blueprint rule: in-place restore on the live primary is prohibited,
 * and the API process never runs pg_restore (this code lives only in the Maintenance runtime).
 */
export async function runRestore(opts: {
  manifestPath: string;
  targetDatabaseUrl: string;      // MUST differ from the primary DATABASE_URL
  isolatedObjectPrefix: string;   // e.g. "restore/<ts>"
  operator?: string;
}) {
  const primary = process.env.DATABASE_URL!;
  if (sameDatabase(opts.targetDatabaseUrl, primary)) {
    throw new InPlaceRestoreRefused("Refusing in-place restore: target equals the live primary database");
  }

  // Record intent against the PRIMARY control DB (evidence), even though data lands elsewhere.
  const control = getDb(primary);
  const manifest = readManifest(opts.manifestPath);
  const [run] = await control.insert(schema.restoreRuns).values({
    backupRunId: manifest.backupId,
    manifestPath: opts.manifestPath,
    targetDatabase: redact(opts.targetDatabaseUrl),
    targetObjectNamespace: opts.isolatedObjectPrefix,
  }).returning();

  try {
    // 1) Verify checksums before touching anything.
    const verify = await verifyBackup(opts.manifestPath);
    if (!verify.ok) {
      await control.update(schema.restoreRuns).set({ status: "refused", evidence: verify, completedAt: new Date() }).where(eq(schema.restoreRuns.id, run.id));
      throw new Error("Checksum verification failed; restore aborted");
    }

    // 2) Restore the database dump into the ISOLATED target.
    const base = dirname(opts.manifestPath);
    const dumpPath = join(base, manifest.artifacts.find((a) => a.kind === "database")!.path);
    execFileSync("pg_restore", ["--clean", "--if-exists", "--no-owner", "--dbname", opts.targetDatabaseUrl, dumpPath], { stdio: "inherit" });

    // 3) Re-import objects into the ISOLATED namespace prefix.
    const objIndex = JSON.parse(readFileSync(join(base, "objects.index.json"), "utf8")) as { bucket: string; keys: string[] };
    await importObjects(objIndex.bucket, objIndex.keys, join(base, "objects"), opts.isolatedObjectPrefix);

    const evidence = { checksums: "verified", databaseObjects: objIndex.keys.length, verifiedArtifacts: verify.artifacts.length };
    await control.update(schema.restoreRuns).set({ status: "completed", checksumsVerified: true, evidence, completedAt: new Date() }).where(eq(schema.restoreRuns.id, run.id));
    return { restoreRunId: run.id, evidence };
  } catch (e) {
    await control.update(schema.restoreRuns).set({ status: "failed", completedAt: new Date() }).where(eq(schema.restoreRuns.id, run.id));
    throw e;
  }
}

function sameDatabase(a: string, b: string): boolean {
  try {
    const ua = new URL(a), ub = new URL(b);
    return ua.host === ub.host && ua.pathname === ub.pathname;
  } catch { return a === b; }
}
function redact(url: string) { try { const u = new URL(url); u.password = "***"; return u.toString(); } catch { return "***"; } }
