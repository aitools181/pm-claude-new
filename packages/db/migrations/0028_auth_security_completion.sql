-- Completes core identity security: verification, lockout, reset-token indexes and 2FA recovery codes.

ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "email_verified_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "user_credentials" ADD COLUMN IF NOT EXISTS "failed_login_count" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE "user_credentials" ADD COLUMN IF NOT EXISTS "last_failed_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "user_credentials" ADD COLUMN IF NOT EXISTS "locked_until" timestamp with time zone;
--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "auth_tokens"
    ADD CONSTRAINT "auth_tokens_user_id_users_id_fk"
    FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "auth_tokens_hash_unique" ON "auth_tokens" ("token_hash");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "auth_tokens_user_purpose_idx" ON "auth_tokens" ("user_id", "purpose", "created_at");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "two_factor_recovery_codes" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("id"),
  "code_hash" text NOT NULL,
  "used_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "two_factor_recovery_codes_hash_unique" ON "two_factor_recovery_codes" ("code_hash");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "two_factor_recovery_codes_user_idx" ON "two_factor_recovery_codes" ("user_id", "used_at");
