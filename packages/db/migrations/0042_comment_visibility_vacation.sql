-- 0042_comment_visibility_vacation.sql
-- SEC.D4 comment visibility scoping; NOTIF.D2 vacation mode.

ALTER TABLE "comments" ADD COLUMN IF NOT EXISTS "visibility" text DEFAULT 'all' NOT NULL;
ALTER TABLE "comments" ADD COLUMN IF NOT EXISTS "visibility_role_key" text;

CREATE TABLE IF NOT EXISTS "comment_visible_to_users" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "comment_id" uuid NOT NULL REFERENCES "comments"("id"),
  "user_id" uuid NOT NULL REFERENCES "users"("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "comment_visible_to_unique" ON "comment_visible_to_users" ("comment_id", "user_id");

ALTER TABLE "notification_delivery_settings" ADD COLUMN IF NOT EXISTS "vacation_from" date;
ALTER TABLE "notification_delivery_settings" ADD COLUMN IF NOT EXISTS "vacation_to" date;
