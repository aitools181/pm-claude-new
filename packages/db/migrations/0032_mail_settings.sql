-- Instance-level SMTP configuration. Password is stored encrypted (AES-256-GCM).
CREATE TABLE IF NOT EXISTS "mail_settings" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "host" text NOT NULL,
  "port" integer DEFAULT 587 NOT NULL,
  "secure" boolean DEFAULT false NOT NULL,
  "username" text,
  "password_encrypted" text,
  "from_name" text DEFAULT 'PM Platform' NOT NULL,
  "from_email" text NOT NULL,
  "reply_to" text,
  "enabled" boolean DEFAULT false NOT NULL,
  "last_test_at" timestamp with time zone,
  "last_test_ok" boolean,
  "last_test_error" text,
  "updated_by_user_id" uuid,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "mail_settings" ADD CONSTRAINT "mail_settings_updated_by_user_id_users_id_fk"
    FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
