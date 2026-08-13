import { Inject, Injectable, OnModuleInit } from "@nestjs/common";
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, HeadBucketCommand, CreateBucketCommand } from "@aws-sdk/client-s3";
import type { Readable } from "node:stream";
import type { Env } from "@pm/shared";
import { ENV } from "../config/config.module.js";

/** Thin wrapper over the PRIVATE object store. No public URLs are ever issued. */
@Injectable()
export class StorageGateway implements OnModuleInit {
  private readonly enabled: boolean;
  private readonly region: string;
  private readonly bucket: string;
  private readonly s3: S3Client;

  constructor(@Inject(ENV) env: Env) {
    this.enabled = Boolean(env.S3_ENDPOINT);
    this.region = env.S3_REGION;
    this.bucket = env.S3_BUCKET ?? "pm-platform";
    this.s3 = new S3Client({
      endpoint: env.S3_ENDPOINT,
      region: this.region,
      forcePathStyle: Boolean(env.S3_ENDPOINT),
      credentials: env.S3_ACCESS_KEY && env.S3_SECRET_KEY
        ? { accessKeyId: env.S3_ACCESS_KEY, secretAccessKey: env.S3_SECRET_KEY }
        : undefined,
    });
  }

  async onModuleInit() {
    if (!this.enabled) return;
    await this.ensureBucket();
  }

  isEnabled() { return this.enabled; }

  async healthCheck() {
    if (!this.enabled) return { ok: true, detail: "disabled" };
    await this.s3.send(new HeadBucketCommand({ Bucket: this.bucket }));
    return { ok: true, detail: this.bucket };
  }

  private async ensureBucket() {
    try {
      await this.s3.send(new HeadBucketCommand({ Bucket: this.bucket }));
      return;
    } catch {
      await this.s3.send(new CreateBucketCommand({
        Bucket: this.bucket,
        ...(this.region !== "us-east-1" ? { CreateBucketConfiguration: { LocationConstraint: this.region as any } } : {}),
      }));
      await this.s3.send(new HeadBucketCommand({ Bucket: this.bucket }));
    }
  }

  put(key: string, body: Readable | Buffer, contentType: string) {
    if (!this.enabled) throw new Error("Object storage is not configured");
    return this.s3.send(new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: body as any, ContentType: contentType }));
  }
  async get(key: string): Promise<Readable> {
    if (!this.enabled) throw new Error("Object storage is not configured");
    const res = await this.s3.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
    return res.Body as Readable;
  }
  del(key: string) {
    if (!this.enabled) throw new Error("Object storage is not configured");
    return this.s3.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }
}
