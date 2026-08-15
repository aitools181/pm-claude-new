-- 0036_skills_and_digest.sql
-- F16 skills registry + F23 notification digest & quiet hours.

CREATE TABLE IF NOT EXISTS "user_skills" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id"),
  "user_id" uuid NOT NULL REFERENCES "users"("id"),
  "skill" text NOT NULL,
  "level" integer DEFAULT 3 NOT NULL,
  "version" integer DEFAULT 1 NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "created_by" uuid,
  "updated_at" timestamptz DEFAULT now() NOT NULL,
  "updated_by" uuid,
  "deleted_at" timestamptz,
  "deleted_by" uuid
);
CREATE UNIQUE INDEX IF NOT EXISTS "user_skills_unique" ON "user_skills" ("organization_id", "user_id", "skill");
CREATE INDEX IF NOT EXISTS "user_skills_skill_idx" ON "user_skills" ("organization_id", "skill");

CREATE TABLE IF NOT EXISTS "notification_delivery_settings" (
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id"),
  "user_id" uuid NOT NULL REFERENCES "users"("id"),
  "digest_frequency" text DEFAULT 'off' NOT NULL,      -- off|daily|weekly
  "digest_hour" integer DEFAULT 9 NOT NULL,            -- 0-23 local-to-org hour
  "quiet_from" integer,                                -- 0-23, null = no quiet hours
  "quiet_to" integer,
  "updated_at" timestamptz DEFAULT now() NOT NULL,
  PRIMARY KEY ("organization_id", "user_id")
);

CREATE TABLE IF NOT EXISTS "notification_digest_queue" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id"),
  "user_id" uuid NOT NULL REFERENCES "users"("id"),
  "subject" text NOT NULL,
  "body" text NOT NULL,
  "queued_reason" text NOT NULL,                       -- digest|quiet_hours
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "flushed_at" timestamptz
);
CREATE INDEX IF NOT EXISTS "notif_digest_queue_user_idx" ON "notification_digest_queue" ("organization_id", "user_id", "flushed_at");
