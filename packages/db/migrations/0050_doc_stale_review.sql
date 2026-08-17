-- 0050_doc_stale_review.sql
-- DOC.D1 doc reviewed-on tracking + stale badge (GOAL.D1 check-ins were
-- already fully implemented in an earlier pass — no schema change needed).

ALTER TABLE "documents" ADD COLUMN IF NOT EXISTS "reviewed_at" timestamptz;
ALTER TABLE "documents" ADD COLUMN IF NOT EXISTS "reviewed_by_user_id" uuid;
ALTER TABLE "documents" ADD COLUMN IF NOT EXISTS "stale_after_days" integer;
ALTER TABLE "organization_settings" ADD COLUMN IF NOT EXISTS "doc_stale_default_days" integer DEFAULT 90 NOT NULL;
