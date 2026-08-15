-- 0035_support_access.sql
-- F01: time-bound, reasoned platform-admin support access.

CREATE TABLE IF NOT EXISTS "support_access_grants" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id"),
  "platform_admin_user_id" uuid NOT NULL REFERENCES "users"("id"),
  "reason" text NOT NULL,
  "expires_at" timestamptz NOT NULL,
  "revoked_at" timestamptz,
  "revoked_by" uuid REFERENCES "users"("id"),
  "created_at" timestamptz DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "support_access_admin_org_idx" ON "support_access_grants" ("platform_admin_user_id", "organization_id");
CREATE INDEX IF NOT EXISTS "support_access_org_idx" ON "support_access_grants" ("organization_id");
