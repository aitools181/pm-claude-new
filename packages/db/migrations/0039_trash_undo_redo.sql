-- 0039_trash_undo_redo.sql
-- X01: delete capture columns for trash-scope/cascade-restore, and the
-- reversible-actions table backing the session-scoped Undo/Redo stack.

ALTER TABLE "work_items" ADD COLUMN IF NOT EXISTS "delete_reason" text;
ALTER TABLE "work_items" ADD COLUMN IF NOT EXISTS "delete_source" text;
ALTER TABLE "work_items" ADD COLUMN IF NOT EXISTS "cascade_root_id" uuid;

CREATE TABLE IF NOT EXISTS "reversible_actions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id"),
  "user_id" uuid NOT NULL REFERENCES "users"("id"),
  "action_type" text NOT NULL,
  "target_type" text NOT NULL,
  "target_ids" jsonb NOT NULL,
  "pre_image" jsonb NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "undone_at" timestamptz,
  "redone_at" timestamptz
);
CREATE INDEX IF NOT EXISTS "reversible_actions_user_idx" ON "reversible_actions" ("organization_id", "user_id", "created_at");
