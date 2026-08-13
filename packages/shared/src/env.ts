import { z } from "zod";

/**
 * Single source of truth for environment validation.
 * Fails fast and safely — a missing/invalid var stops boot.
 */
export const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  APP_URL: z.string().url().default("http://localhost:3000"),
  CORS_ORIGINS: z.string().optional(),
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  SESSION_SECRET: z.string().min(32),
  S3_ENDPOINT: z.string().url().optional(),
  S3_REGION: z.string().default("us-east-1"),
  S3_ACCESS_KEY: z.string().min(1).optional(),
  S3_SECRET_KEY: z.string().min(1).optional(),
  S3_BUCKET: z.string().min(1).optional(),
  AI_PROVIDER: z.enum(["mock", "openai_compatible", "disabled"]).default("mock"),
  AI_BASE_URL: z.string().url().optional(),
  AI_API_KEY: z.string().min(1).optional(),
  AI_MODEL: z.string().min(1).optional(),
}).superRefine((env, ctx) => {
  const s3 = [env.S3_ENDPOINT, env.S3_ACCESS_KEY, env.S3_SECRET_KEY, env.S3_BUCKET];
  const anyS3 = s3.some(Boolean);
  const allS3 = s3.every(Boolean);
  if (anyS3 && !allS3) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["S3_ENDPOINT"], message: "S3_ENDPOINT, S3_ACCESS_KEY, S3_SECRET_KEY and S3_BUCKET must be configured together" });
  }
  if (env.NODE_ENV === "production" && !allS3) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["S3_ENDPOINT"], message: "Object storage is required in production" });
  }
  if (env.AI_PROVIDER === "openai_compatible" && (!env.AI_BASE_URL || !env.AI_API_KEY || !env.AI_MODEL)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["AI_PROVIDER"], message: "AI_BASE_URL, AI_API_KEY and AI_MODEL are required for openai_compatible" });
  }
  if (env.NODE_ENV === "production" && env.AI_PROVIDER === "mock") {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["AI_PROVIDER"], message: "Mock AI provider is not allowed in production; use openai_compatible or disabled" });
  }
});

export type Env = z.infer<typeof envSchema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  return parsed.data;
}
