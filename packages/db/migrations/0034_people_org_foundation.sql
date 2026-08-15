-- 0034_people_org_foundation.sql
-- F03 extended user profile, F03 team depth + membership effective dates,
-- F01 organization settings depth, and invitation bulk/import support columns.

ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "avatar_url" text;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "designation" text;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "department" text;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "manager_user_id" uuid;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "working_hours" jsonb;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "contact_fields" jsonb;

ALTER TABLE "teams" ADD COLUMN IF NOT EXISTS "leader_user_id" uuid;
ALTER TABLE "teams" ADD COLUMN IF NOT EXISTS "parent_team_id" uuid;
ALTER TABLE "teams" ADD COLUMN IF NOT EXISTS "description" text;
CREATE INDEX IF NOT EXISTS "teams_parent_idx" ON "teams" ("parent_team_id");

ALTER TABLE "team_members" ADD COLUMN IF NOT EXISTS "effective_from" date;
ALTER TABLE "team_members" ADD COLUMN IF NOT EXISTS "effective_to" date;

ALTER TABLE "organization_settings" ADD COLUMN IF NOT EXISTS "time_format" text DEFAULT '24h' NOT NULL;
ALTER TABLE "organization_settings" ADD COLUMN IF NOT EXISTS "number_format" text DEFAULT '1,234.56' NOT NULL;
ALTER TABLE "organization_settings" ADD COLUMN IF NOT EXISTS "working_days" jsonb;
ALTER TABLE "organization_settings" ADD COLUMN IF NOT EXISTS "fiscal_year_start_month" integer DEFAULT 4 NOT NULL;
ALTER TABLE "organization_settings" ADD COLUMN IF NOT EXISTS "retention_days" integer;
