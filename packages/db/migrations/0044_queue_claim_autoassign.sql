-- 0044_queue_claim_autoassign.sql
-- ASN.D3 auto-assignment round-robin cursor; ASN.D4 queue/claim limit policy.

ALTER TABLE "organization_settings" ADD COLUMN IF NOT EXISTS "max_open_claims_per_user" integer;

CREATE TABLE IF NOT EXISTS "auto_assignment_cursors" (
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id"),
  "project_id" uuid NOT NULL REFERENCES "projects"("id"),
  "last_assigned_user_id" uuid,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "auto_assignment_cursor_pk" ON "auto_assignment_cursors" ("organization_id", "project_id");
