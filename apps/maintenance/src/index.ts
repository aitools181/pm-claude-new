import { runBackup } from "./backup.js";
import { runRestore } from "./restore.js";
import { verifyBackup } from "./verify.js";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const cmd = process.argv[2];
  switch (cmd) {
    case "backup": {
      const out = arg("out") ?? "/backups";
      const res = await runBackup({ outRoot: out, note: arg("note"), operator: arg("operator") });
      console.log(JSON.stringify(res, null, 2));
      break;
    }
    case "verify": {
      const manifest = arg("manifest");
      if (!manifest) throw new Error("--manifest <path> required");
      const res = await verifyBackup(manifest);
      console.log(JSON.stringify(res, null, 2));
      process.exit(res.ok ? 0 : 1);
      break;
    }
    case "restore": {
      const manifest = arg("manifest");
      const into = arg("into");            // isolated target database URL
      const prefix = arg("object-prefix") ?? `restore/${Date.now()}`;
      if (!manifest || !into) throw new Error("--manifest <path> and --into <isolated-db-url> required");
      const res = await runRestore({ manifestPath: manifest, targetDatabaseUrl: into, isolatedObjectPrefix: prefix, operator: arg("operator") });
      console.log(JSON.stringify(res, null, 2));
      break;
    }
    default:
      console.log("Usage: pm-maint <backup|verify|restore> [--out|--manifest|--into|--object-prefix|--note|--operator]");
      process.exit(1);
  }
}
main().catch((e) => { console.error("[maintenance]", e.message); process.exit(1); });
