-- 0046_item_security_levels.sql
-- SEC.D1 item security level scheme.

CREATE TABLE IF NOT EXISTS "security_levels" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id"),
  "project_id" uuid NOT NULL REFERENCES "projects"("id"),
  "name" text NOT NULL,
  "rank" integer DEFAULT 0 NOT NULL
);
CREATE INDEX IF NOT EXISTS "security_levels_project_idx" ON "security_levels" ("project_id");
CREATE UNIQUE INDEX IF NOT EXISTS "security_levels_project_name_unique" ON "security_levels" ("project_id", "name");

CREATE TABLE IF NOT EXISTS "security_level_grants" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id"),
  "security_level_id" uuid NOT NULL REFERENCES "security_levels"("id"),
  "grantee_type" text NOT NULL,
  "user_id" uuid REFERENCES "users"("id"),
  "role_key" text
);
CREATE INDEX IF NOT EXISTS "security_level_grants_level_idx" ON "security_level_grants" ("security_level_id");

ALTER TABLE "work_items" ADD COLUMN IF NOT EXISTS "security_level_id" uuid;
