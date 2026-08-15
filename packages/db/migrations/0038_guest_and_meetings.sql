-- 0038_guest_and_meetings.sql
-- F03 guest account type + F40 meeting transcript capture.

ALTER TABLE "organization_memberships" ADD COLUMN IF NOT EXISTS "account_type" text DEFAULT 'member' NOT NULL;
ALTER TABLE "meetings" ADD COLUMN IF NOT EXISTS "transcript" text;
