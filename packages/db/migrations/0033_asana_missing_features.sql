ALTER TABLE "user_ui_preferences" ADD COLUMN IF NOT EXISTS "personal_week_start" integer;
ALTER TABLE "user_ui_preferences" ADD COLUMN IF NOT EXISTS "notification_popup_seconds" integer DEFAULT 5 NOT NULL;
ALTER TABLE "user_ui_preferences" ADD COLUMN IF NOT EXISTS "default_landing" text DEFAULT '/home' NOT NULL;
ALTER TABLE "user_ui_preferences" ADD COLUMN IF NOT EXISTS "show_row_numbers" boolean DEFAULT false NOT NULL;
ALTER TABLE "user_ui_preferences" ADD COLUMN IF NOT EXISTS "color_blind_mode" boolean DEFAULT false NOT NULL;
ALTER TABLE "user_ui_preferences" ADD COLUMN IF NOT EXISTS "celebrations" boolean DEFAULT true NOT NULL;
ALTER TABLE "user_ui_preferences" ADD COLUMN IF NOT EXISTS "inbox_summary_enabled" boolean DEFAULT true NOT NULL;
ALTER TABLE "user_ui_preferences" ADD COLUMN IF NOT EXISTS "inbox_summary_timeframe" text DEFAULT 'week' NOT NULL;
ALTER TABLE "user_ui_preferences" ADD COLUMN IF NOT EXISTS "navigation_preferences" jsonb DEFAULT '{}'::jsonb NOT NULL;

ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "icon" text DEFAULT 'project' NOT NULL;

ALTER TABLE "portfolio_projects" ADD COLUMN IF NOT EXISTS "budget_cents" integer;
ALTER TABLE "portfolio_projects" ADD COLUMN IF NOT EXISTS "service_line" text;
ALTER TABLE "portfolio_projects" ADD COLUMN IF NOT EXISTS "custom_fields" jsonb DEFAULT '{}'::jsonb NOT NULL;

CREATE TABLE IF NOT EXISTS "portfolio_columns" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id"),
  "portfolio_id" uuid NOT NULL REFERENCES "portfolios"("id"),
  "key" text NOT NULL,
  "name" text NOT NULL,
  "type" text DEFAULT 'text' NOT NULL,
  "rank" integer DEFAULT 0 NOT NULL,
  "config" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "portfolio_columns_unique" ON "portfolio_columns" ("portfolio_id", "key");
CREATE INDEX IF NOT EXISTS "portfolio_columns_portfolio_idx" ON "portfolio_columns" ("organization_id", "portfolio_id", "rank");

CREATE TABLE IF NOT EXISTS "project_ai_summary_settings" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id"),
  "project_id" uuid NOT NULL REFERENCES "projects"("id"),
  "include_sources" boolean DEFAULT true NOT NULL,
  "include_risk_report" boolean DEFAULT true NOT NULL,
  "regular_updates" boolean DEFAULT false NOT NULL,
  "timeframe" text DEFAULT '30d' NOT NULL,
  "summary" text,
  "generated_at" timestamptz,
  "generated_by" uuid REFERENCES "users"("id"),
  "updated_at" timestamptz DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "project_ai_summary_settings_unique" ON "project_ai_summary_settings" ("organization_id", "project_id");

CREATE TABLE IF NOT EXISTS "user_email_addresses" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("id"),
  "email" text NOT NULL,
  "label" text,
  "verified_at" timestamptz,
  "verification_token_hash" text,
  "verification_expires_at" timestamptz,
  "created_at" timestamptz DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "user_email_addresses_email_unique" ON "user_email_addresses" ("email");
CREATE INDEX IF NOT EXISTS "user_email_addresses_user_idx" ON "user_email_addresses" ("user_id");
