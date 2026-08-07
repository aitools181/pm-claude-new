import { describe, it, expect } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { verifyBackup } from "../src/verify.js";

function sha(s: string) { return createHash("sha256").update(s).digest("hex"); }

describe("backup verification", () => {
  it("reconciles artifacts whose checksums match the manifest", async () => {
    const dir = mkdtempSync(join(tmpdir(), "bkp-"));
    const content = "config-bytes";
    writeFileSync(join(dir, "config.json"), content);
    const manifest = {
      version: 1, backupId: "b1", createdAt: new Date().toISOString(),
      databaseName: "db", objectNamespace: "bucket",
      artifacts: [{ kind: "config", path: "config.json", sha256: sha(content), bytes: content.length }],
    };
    writeFileSync(join(dir, "manifest.json"), JSON.stringify(manifest));
    const res = await verifyBackup(join(dir, "manifest.json"));
    expect(res.ok).toBe(true);
  });

  it("fails verification when an artifact is tampered", async () => {
    const dir = mkdtempSync(join(tmpdir(), "bkp-"));
    writeFileSync(join(dir, "config.json"), "TAMPERED");
    const manifest = {
      version: 1, backupId: "b1", createdAt: new Date().toISOString(),
      databaseName: "db", objectNamespace: "bucket",
      artifacts: [{ kind: "config", path: "config.json", sha256: sha("original"), bytes: 8 }],
    };
    writeFileSync(join(dir, "manifest.json"), JSON.stringify(manifest));
    const res = await verifyBackup(join(dir, "manifest.json"));
    expect(res.ok).toBe(false);
  });
});
