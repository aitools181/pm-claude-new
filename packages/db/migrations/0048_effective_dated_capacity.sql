-- 0048_effective_dated_capacity.sql
-- CAP.D1 effective-dated capacity profiles: allow multiple profile periods
-- per user instead of one static row, and migrate any existing single row
-- forward as an always-open (effectiveFrom/To both null) period.

DROP INDEX IF EXISTS "capacity_profile_user_unique";
ALTER TABLE "capacity_profiles" ADD COLUMN IF NOT EXISTS "effective_from" date;
ALTER TABLE "capacity_profiles" ADD COLUMN IF NOT EXISTS "effective_to" date;
ALTER TABLE "capacity_profiles" ADD COLUMN IF NOT EXISTS "created_at" timestamptz DEFAULT now() NOT NULL;
CREATE INDEX IF NOT EXISTS "capacity_profile_user_idx" ON "capacity_profiles" ("organization_id", "user_id", "effective_from");
