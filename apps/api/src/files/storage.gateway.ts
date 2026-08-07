import { Injectable } from "@nestjs/common";
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import type { Readable } from "node:stream";

/** Thin wrapper over the PRIVATE object store. No public URLs are ever issued. */
@Injectable()
export class StorageGateway {
  private s3 = new S3Client({
    endpoint: process.env.S3_ENDPOINT,
    region: process.env.S3_REGION ?? "us-east-1",
    forcePathStyle: true,
    credentials: { accessKeyId: process.env.S3_ACCESS_KEY!, secretAccessKey: process.env.S3_SECRET_KEY! },
  });
  private bucket = process.env.S3_BUCKET ?? "pm-platform";

  put(key: string, body: Readable | Buffer, contentType: string) {
    return this.s3.send(new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: body as any, ContentType: contentType }));
  }
  async get(key: string): Promise<Readable> {
    const res = await this.s3.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
    return res.Body as Readable;
  }
  del(key: string) { return this.s3.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key })); }
}
