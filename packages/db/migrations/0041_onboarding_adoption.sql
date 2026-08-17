-- 0041_onboarding_adoption.sql
-- X02: onboarding progress, feature spotlight, telemetry settings, feature
-- usage events, and a sample-data flag on projects.

ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "is_sample" boolean DEFAULT false NOT NULL;

CREATE TABLE IF NOT EXISTS "onboarding_progress" (
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id"),
  "user_id" uuid NOT NULL REFERENCES "users"("id"),
  "items" jsonb DEFAULT '{}' NOT NULL,
  "dismissed" boolean DEFAULT false NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "onboarding_progress_pk" ON "onboarding_progress" ("organization_id", "user_id");

CREATE TABLE IF NOT EXISTS "feature_spotlights_seen" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id"),
  "user_id" uuid NOT NULL REFERENCES "users"("id"),
  "spotlight_key" text NOT NULL,
  "seen_at" timestamptz DEFAULT now() NOT NULL,
  "dismissed_permanently" boolean DEFAULT false NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "spotlight_seen_unique" ON "feature_spotlights_seen" ("organization_id", "user_id", "spotlight_key");

CREATE TABLE IF NOT EXISTS "telemetry_settings" (
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id"),
  "category" text NOT NULL,
  "enabled" boolean DEFAULT false NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL,
  "updated_by_user_id" uuid REFERENCES "users"("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "telemetry_settings_pk" ON "telemetry_settings" ("organization_id", "category");

CREATE TABLE IF NOT EXISTS "feature_usage_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id"),
  "user_id" uuid NOT NULL REFERENCES "users"("id"),
  "feature" text NOT NULL,
  "occurred_on" date NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "feature_usage_feature_day_idx" ON "feature_usage_events" ("organization_id", "feature", "occurred_on");
