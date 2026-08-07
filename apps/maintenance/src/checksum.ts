import { createHash } from "node:crypto";
import { createReadStream, statSync } from "node:fs";

export function sha256File(path: string): Promise<{ sha256: string; bytes: number }> {
  return new Promise((resolve, reject) => {
    const hash = createHash("sha256");
    const stream = createReadStream(path);
    stream.on("error", reject);
    stream.on("data", (c) => hash.update(c));
    stream.on("end", () => resolve({ sha256: hash.digest("hex"), bytes: statSync(path).size }));
  });
}
