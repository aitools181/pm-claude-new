-- 0045_timesheet_partial_approval.sql
-- TIME.D2 partial-line timesheet approval.

ALTER TABLE "time_entries" ADD COLUMN IF NOT EXISTS "approval_status" text DEFAULT 'pending' NOT NULL;
ALTER TABLE "time_entries" ADD COLUMN IF NOT EXISTS "rejection_reason" text;

-- VIEW.D1 saved view ownership tiers (personal|team|org).
ALTER TABLE "saved_ui_views" ADD COLUMN IF NOT EXISTS "ownership_tier" text DEFAULT 'personal' NOT NULL;
ALTER TABLE "saved_ui_views" ADD COLUMN IF NOT EXISTS "team_id" uuid;
