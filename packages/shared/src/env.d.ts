import { z } from "zod";
/**
 * Single source of truth for environment validation.
 * Fails fast and safely — a missing/invalid var stops boot (Phase 0 exit gate).
 */
export declare const envSchema: z.ZodObject<{
    NODE_ENV: z.ZodDefault<z.ZodEnum<["development", "test", "production"]>>;
    DATABASE_URL: z.ZodString;
    REDIS_URL: z.ZodString;
    SESSION_SECRET: z.ZodString;
    S3_ENDPOINT: z.ZodOptional<z.ZodString>;
    S3_BUCKET: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    NODE_ENV: "development" | "test" | "production";
    DATABASE_URL: string;
    REDIS_URL: string;
    SESSION_SECRET: string;
    S3_ENDPOINT?: string | undefined;
    S3_BUCKET?: string | undefined;
}, {
    DATABASE_URL: string;
    REDIS_URL: string;
    SESSION_SECRET: string;
    NODE_ENV?: "development" | "test" | "production" | undefined;
    S3_ENDPOINT?: string | undefined;
    S3_BUCKET?: string | undefined;
}>;
export type Env = z.infer<typeof envSchema>;
export declare function loadEnv(source?: NodeJS.ProcessEnv): Env;
