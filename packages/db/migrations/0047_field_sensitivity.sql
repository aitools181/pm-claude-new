-- 0047_field_sensitivity.sql
-- SEC.D2 field sensitivity classification and masked-reveal audit.

ALTER TABLE "custom_field_definitions" ADD COLUMN IF NOT EXISTS "sensitivity" text DEFAULT 'normal' NOT NULL;

CREATE TABLE IF NOT EXISTS "field_reveal_audit" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id"),
  "field_id" uuid NOT NULL REFERENCES "custom_field_definitions"("id"),
  "work_item_id" uuid NOT NULL REFERENCES "work_items"("id"),
  "user_id" uuid NOT NULL REFERENCES "users"("id"),
  "revealed_at" timestamptz DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "field_reveal_audit_field_idx" ON "field_reveal_audit" ("field_id", "revealed_at");
