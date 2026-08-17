-- 0051_dashboard_sharing.sql
-- F21 depth: dashboard team/project scope, external share links with
-- explicit widget allow-list (same secure pattern as roadmap publications).

ALTER TABLE "dashboards" ADD COLUMN IF NOT EXISTS "scope_id" uuid;

CREATE TABLE IF NOT EXISTS "dashboard_shares" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id"),
  "dashboard_id" uuid NOT NULL REFERENCES "dashboards"("id"),
  "token_hash" text NOT NULL,
  "widget_ids" jsonb DEFAULT '[]' NOT NULL,
  "active" boolean DEFAULT true NOT NULL,
  "expires_at" timestamptz,
  "view_count" integer DEFAULT 0 NOT NULL,
  "created_by_user_id" uuid REFERENCES "users"("id"),
  "created_at" timestamptz DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "dashboard_shares_token_unique" ON "dashboard_shares" ("token_hash");
