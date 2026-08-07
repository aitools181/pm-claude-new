-- Completes F29-F42 schema additions introduced after migration 0026.
-- Safe to apply to fresh or already-migrated installations.

ALTER TABLE "idempotency_keys" ADD COLUMN IF NOT EXISTS "request_hash" text;
--> statement-breakpoint

DROP INDEX IF EXISTS "external_identities_subject_unique";
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "external_identities_provider_subject_unique"
  ON "external_identities" ("organization_id", "provider_id", "external_subject")
  WHERE "provider_id" IS NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "external_identities_connector_subject_unique"
  ON "external_identities" ("organization_id", "connector_id", "external_subject")
  WHERE "connector_id" IS NOT NULL;
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "query_subscriptions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id"),
  "saved_query_id" uuid NOT NULL REFERENCES "saved_queries"("id"),
  "user_id" uuid NOT NULL REFERENCES "users"("id"),
  "schedule" text DEFAULT 'daily' NOT NULL,
  "channel" text DEFAULT 'in_app' NOT NULL,
  "only_when_changed" boolean DEFAULT true NOT NULL,
  "enabled" boolean DEFAULT true NOT NULL,
  "last_result_hash" text,
  "last_run_at" timestamp with time zone,
  "next_run_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "query_subscriptions_unique" ON "query_subscriptions" ("saved_query_id", "user_id", "channel");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "query_subscriptions_due_idx" ON "query_subscriptions" ("organization_id", "enabled", "next_run_at");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "configuration_bundles" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id"),
  "name" text NOT NULL,
  "description" text,
  "status" text DEFAULT 'draft' NOT NULL,
  "current_version" integer DEFAULT 0 NOT NULL,
  "created_by_user_id" uuid NOT NULL REFERENCES "users"("id"),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "configuration_bundles_org_name_unique" ON "configuration_bundles" ("organization_id", "name");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "configuration_bundle_versions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id"),
  "bundle_id" uuid NOT NULL REFERENCES "configuration_bundles"("id"),
  "version" integer NOT NULL,
  "snapshot" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "checksum" text NOT NULL,
  "change_summary" text,
  "published" boolean DEFAULT false NOT NULL,
  "created_by_user_id" uuid NOT NULL REFERENCES "users"("id"),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "configuration_bundle_versions_unique" ON "configuration_bundle_versions" ("bundle_id", "version");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "configuration_bundle_checksum_idx" ON "configuration_bundle_versions" ("organization_id", "checksum");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "project_configuration_bindings" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id"),
  "project_id" uuid NOT NULL REFERENCES "projects"("id"),
  "bundle_id" uuid NOT NULL REFERENCES "configuration_bundles"("id"),
  "bundle_version_id" uuid NOT NULL REFERENCES "configuration_bundle_versions"("id"),
  "applied_by_user_id" uuid NOT NULL REFERENCES "users"("id"),
  "applied_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "project_configuration_binding_unique" ON "project_configuration_bindings" ("project_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "project_configuration_binding_bundle_idx" ON "project_configuration_bindings" ("bundle_id");
--> statement-breakpoint

INSERT INTO "permissions" ("key", "description") VALUES
  ('enterprise_identity.manage', 'enterprise_identity.manage'),
  ('calculation.manage', 'calculation.manage'),
  ('scenario.manage', 'scenario.manage'),
  ('migration.manage', 'migration.manage'),
  ('devops.manage', 'devops.manage'),
  ('connected_search.manage', 'connected_search.manage'),
  ('sandbox.manage', 'sandbox.manage'),
  ('service_management.manage', 'service_management.manage'),
  ('discovery.manage', 'discovery.manage'),
  ('communications.manage', 'communications.manage'),
  ('productivity.use', 'productivity.use'),
  ('ai_agent.manage', 'ai_agent.manage')
ON CONFLICT ("key") DO NOTHING;
--> statement-breakpoint

INSERT INTO "role_permissions" ("organization_id", "role_id", "permission_key")
SELECT r."organization_id", r."id", p."key"
FROM "roles" r
JOIN "permissions" p ON p."key" IN (
  'enterprise_identity.manage','calculation.manage','scenario.manage','migration.manage',
  'devops.manage','connected_search.manage','sandbox.manage','service_management.manage',
  'discovery.manage','communications.manage','productivity.use','ai_agent.manage'
)
WHERE r."key" = 'organization_admin'
ON CONFLICT ("role_id", "permission_key") DO NOTHING;
