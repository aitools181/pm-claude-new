import { S3Client, ListObjectsV2Command, GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { createWriteStream, mkdirSync, createReadStream } from "node:fs";
import { pipeline } from "node:stream/promises";
import { dirname, join } from "node:path";
import type { Readable } from "node:stream";

function client() {
  return new S3Client({
    endpoint: process.env.S3_ENDPOINT,
    region: process.env.S3_REGION ?? "us-east-1",
    forcePathStyle: true, // required for MinIO
    credentials: { accessKeyId: process.env.S3_ACCESS_KEY!, secretAccessKey: process.env.S3_SECRET_KEY! },
  });
}

/** Download every object under a prefix into a local directory. Returns keys. */
export async function exportObjects(bucket: string, prefix: string, outDir: string): Promise<string[]> {
  const s3 = client();
  const keys: string[] = [];
  let token: string | undefined;
  do {
    const res = await s3.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix, ContinuationToken: token }));
    for (const obj of res.Contents ?? []) {
      if (!obj.Key) continue;
      const out = join(outDir, obj.Key);
      mkdirSync(dirname(out), { recursive: true });
      const got = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: obj.Key }));
      await pipeline(got.Body as Readable, createWriteStream(out));
      keys.push(obj.Key);
    }
    token = res.NextContinuationToken;
  } while (token);
  return keys;
}

/** Upload objects into an ISOLATED namespace (a distinct prefix), never the primary. */
export async function importObjects(bucket: string, keys: string[], srcDir: string, isolatedPrefix: string) {
  const s3 = client();
  for (const key of keys) {
    await s3.send(new PutObjectCommand({
      Bucket: bucket,
      Key: `${isolatedPrefix}/${key}`,
      Body: createReadStream(join(srcDir, key)),
    }));
  }
}
