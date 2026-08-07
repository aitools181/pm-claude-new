import { writeFileSync, readFileSync } from "node:fs";

export type Artifact = { kind: "database" | "objects" | "config"; path: string; sha256: string; bytes: number };
export type Manifest = {
  version: 1;
  backupId: string;
  createdAt: string;
  databaseName: string;
  objectNamespace: string;
  artifacts: Artifact[];
};

export const writeManifest = (path: string, m: Manifest) => writeFileSync(path, JSON.stringify(m, null, 2));
export const readManifest = (path: string): Manifest => JSON.parse(readFileSync(path, "utf8"));
