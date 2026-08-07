import { join, dirname } from "node:path";
import { sha256File } from "./checksum.js";
import { readManifest } from "./manifest.js";

export type VerifyResult = { ok: boolean; artifacts: { path: string; ok: boolean; expected: string; actual: string }[] };

/** Recompute every artifact's sha256 and compare to the manifest. */
export async function verifyBackup(manifestPath: string): Promise<VerifyResult> {
  const manifest = readManifest(manifestPath);
  const base = dirname(manifestPath);
  const results = [];
  for (const a of manifest.artifacts) {
    const { sha256 } = await sha256File(join(base, a.path));
    results.push({ path: a.path, ok: sha256 === a.sha256, expected: a.sha256, actual: sha256 });
  }
  return { ok: results.every((r) => r.ok), artifacts: results };
}
