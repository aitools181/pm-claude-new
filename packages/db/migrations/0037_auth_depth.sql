-- 0037_auth_depth.sql
-- F02: username login + configurable password policy.

ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "username" text;
CREATE UNIQUE INDEX IF NOT EXISTS "users_username_unique" ON "users" ("username");
ALTER TABLE "organization_settings" ADD COLUMN IF NOT EXISTS "password_policy" jsonb;
