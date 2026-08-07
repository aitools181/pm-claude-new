-- F29-F42 advanced capability domains
-- Generated from TypeScript schema declarations.

CREATE TABLE IF NOT EXISTS "identity_providers" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id"),
  "kind" text NOT NULL,
  "name" text NOT NULL,
  "issuer_url" text,
  "metadata_url" text,
  "client_id" text,
  "config" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "status" text DEFAULT 'draft' NOT NULL,
  "enforcement_mode" text DEFAULT 'optional' NOT NULL,
  "test_mode" boolean DEFAULT true NOT NULL,
  "certificate_fingerprint" text,
  "last_health_at" timestamp with time zone,
  "last_health_status" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_by" uuid,
  "deleted_at" timestamp with time zone,
  "deleted_by" uuid,
  "version" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "identity_providers_org_idx" ON "identity_providers" ("organization_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "identity_providers_org_name_unique" ON "identity_providers" ("organization_id", "name");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "verified_domains" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id"),
  "provider_id" uuid REFERENCES "identity_providers"("id"),
  "domain" text NOT NULL,
  "verification_token_hash" text NOT NULL,
  "verified_at" timestamp with time zone,
  "claimed_by_user_id" uuid REFERENCES "users"("id"),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "verified_domains_org_domain_unique" ON "verified_domains" ("organization_id", "domain");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "directory_connectors" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id"),
  "kind" text NOT NULL,
  "name" text NOT NULL,
  "config" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "credential_ref" text,
  "schedule_cron" text,
  "status" text DEFAULT 'draft' NOT NULL,
  "last_sync_at" timestamp with time zone,
  "sync_cursor" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_by" uuid,
  "deleted_at" timestamp with time zone,
  "deleted_by" uuid,
  "version" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "directory_connectors_org_idx" ON "directory_connectors" ("organization_id");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "provisioning_mappings" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id"),
  "connector_id" uuid NOT NULL REFERENCES "directory_connectors"("id"),
  "external_group" text NOT NULL,
  "target_role_key" text,
  "target_team_id" uuid REFERENCES "teams"("id"),
  "high_risk" boolean DEFAULT false NOT NULL,
  "approved_by_user_id" uuid REFERENCES "users"("id"),
  "approved_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "provisioning_mappings_unique" ON "provisioning_mappings" ("connector_id", "external_group", "target_role_key");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "external_identities" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id"),
  "provider_id" uuid REFERENCES "identity_providers"("id"),
  "connector_id" uuid REFERENCES "directory_connectors"("id"),
  "external_subject" text NOT NULL,
  "user_id" uuid REFERENCES "users"("id"),
  "email" text,
  "attributes" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "status" text DEFAULT 'active' NOT NULL,
  "last_seen_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "external_identities_subject_unique" ON "external_identities" ("organization_id", "external_subject");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "external_identities_user_idx" ON "external_identities" ("organization_id", "user_id");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "directory_sync_runs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id"),
  "connector_id" uuid NOT NULL REFERENCES "directory_connectors"("id"),
  "mode" text DEFAULT 'preview' NOT NULL,
  "status" text DEFAULT 'running' NOT NULL,
  "cursor_before" text,
  "cursor_after" text,
  "summary" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "errors" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "started_by_user_id" uuid REFERENCES "users"("id"),
  "started_at" timestamp with time zone DEFAULT now() NOT NULL,
  "finished_at" timestamp with time zone
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "directory_sync_runs_connector_idx" ON "directory_sync_runs" ("connector_id", "started_at");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "sso_exemptions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id"),
  "user_id" uuid NOT NULL REFERENCES "users"("id"),
  "reason" text NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  "created_by_user_id" uuid NOT NULL REFERENCES "users"("id"),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "sso_exemptions_org_user_unique" ON "sso_exemptions" ("organization_id", "user_id");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "break_glass_codes" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id"),
  "user_id" uuid NOT NULL REFERENCES "users"("id"),
  "code_hash" text NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  "used_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "break_glass_codes_org_user_idx" ON "break_glass_codes" ("organization_id", "user_id");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "relation_paths" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id"),
  "key" text NOT NULL,
  "name" text NOT NULL,
  "source_type" text DEFAULT 'work_item' NOT NULL,
  "target_type" text DEFAULT 'work_item' NOT NULL,
  "path_kind" text NOT NULL,
  "config" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "relation_paths_org_key_unique" ON "relation_paths" ("organization_id", "key");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "calculated_field_definitions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id"),
  "target_field_id" uuid NOT NULL REFERENCES "custom_field_definitions"("id"),
  "relation_path_id" uuid REFERENCES "relation_paths"("id"),
  "kind" text NOT NULL,
  "source_field_key" text NOT NULL,
  "operation" text,
  "filter" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "config" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "refresh_mode" text DEFAULT 'eventual' NOT NULL,
  "active" boolean DEFAULT true NOT NULL,
  "created_by_user_id" uuid NOT NULL REFERENCES "users"("id"),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "calculated_fields_org_idx" ON "calculated_field_definitions" ("organization_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "calculated_fields_target_unique" ON "calculated_field_definitions" ("target_field_id");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "calculation_dependencies" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id"),
  "calculation_id" uuid NOT NULL REFERENCES "calculated_field_definitions"("id"),
  "depends_on_calculation_id" uuid REFERENCES "calculated_field_definitions"("id"),
  "depends_on_field_id" uuid REFERENCES "custom_field_definitions"("id")
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "calculation_dependencies_unique" ON "calculation_dependencies" ("calculation_id", "depends_on_calculation_id", "depends_on_field_id");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "rollup_projections" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id"),
  "work_item_id" uuid NOT NULL REFERENCES "work_items"("id"),
  "calculation_id" uuid NOT NULL REFERENCES "calculated_field_definitions"("id"),
  "value_number" double precision,
  "value_text" text,
  "value_json" jsonb,
  "source_count" integer DEFAULT 0 NOT NULL,
  "redacted_count" integer DEFAULT 0 NOT NULL,
  "overridden" boolean DEFAULT false NOT NULL,
  "error" text,
  "calculated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "rollup_projections_unique" ON "rollup_projections" ("work_item_id", "calculation_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "rollup_projections_calc_idx" ON "rollup_projections" ("calculation_id");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "recalculation_runs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id"),
  "calculation_id" uuid NOT NULL REFERENCES "calculated_field_definitions"("id"),
  "scope_type" text DEFAULT 'organization' NOT NULL,
  "scope_id" uuid,
  "status" text DEFAULT 'running' NOT NULL,
  "processed" integer DEFAULT 0 NOT NULL,
  "failed" integer DEFAULT 0 NOT NULL,
  "error_summary" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "started_by_user_id" uuid NOT NULL REFERENCES "users"("id"),
  "started_at" timestamp with time zone DEFAULT now() NOT NULL,
  "finished_at" timestamp with time zone
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "recalculation_runs_calc_idx" ON "recalculation_runs" ("calculation_id", "started_at");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "planning_scenarios" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id"),
  "name" text NOT NULL,
  "description" text,
  "project_id" uuid REFERENCES "projects"("id"),
  "portfolio_id" uuid REFERENCES "portfolios"("id"),
  "status" text DEFAULT 'draft' NOT NULL,
  "objective" text DEFAULT 'earliest_delivery' NOT NULL,
  "base_snapshot" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "base_version_hash" text NOT NULL,
  "created_by_user_id" uuid NOT NULL REFERENCES "users"("id"),
  "locked_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "planning_scenarios_org_idx" ON "planning_scenarios" ("organization_id", "created_at");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "scenario_changes" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id"),
  "scenario_id" uuid NOT NULL REFERENCES "planning_scenarios"("id"),
  "work_item_id" uuid NOT NULL REFERENCES "work_items"("id"),
  "field" text NOT NULL,
  "before_value" jsonb,
  "after_value" jsonb,
  "selected_for_commit" boolean DEFAULT true NOT NULL,
  "created_by_user_id" uuid NOT NULL REFERENCES "users"("id"),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "scenario_changes_scenario_idx" ON "scenario_changes" ("scenario_id");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "scenario_runs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id"),
  "scenario_id" uuid NOT NULL REFERENCES "planning_scenarios"("id"),
  "kind" text DEFAULT 'schedule' NOT NULL,
  "status" text DEFAULT 'completed' NOT NULL,
  "inputs" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "output" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "explanation" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "created_by_user_id" uuid NOT NULL REFERENCES "users"("id"),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "scenario_runs_scenario_idx" ON "scenario_runs" ("scenario_id", "created_at");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "planning_warnings" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id"),
  "scenario_id" uuid NOT NULL REFERENCES "planning_scenarios"("id"),
  "work_item_id" uuid REFERENCES "work_items"("id"),
  "code" text NOT NULL,
  "severity" text DEFAULT 'warning' NOT NULL,
  "message" text NOT NULL,
  "data" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "planning_warnings_scenario_idx" ON "planning_warnings" ("scenario_id");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "scenario_commit_proposals" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id"),
  "scenario_id" uuid NOT NULL REFERENCES "planning_scenarios"("id"),
  "status" text DEFAULT 'pending' NOT NULL,
  "selected_change_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "conflicts" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "rollback_snapshot" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "requested_by_user_id" uuid NOT NULL REFERENCES "users"("id"),
  "approved_by_user_id" uuid REFERENCES "users"("id"),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "committed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "scenario_commit_proposals_scenario_idx" ON "scenario_commit_proposals" ("scenario_id");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "migration_projects" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id"),
  "vendor" text NOT NULL,
  "name" text NOT NULL,
  "source_mode" text DEFAULT 'export' NOT NULL,
  "status" text DEFAULT 'draft' NOT NULL,
  "source_config" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_by_user_id" uuid NOT NULL REFERENCES "users"("id"),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "migration_projects_org_idx" ON "migration_projects" ("organization_id");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "migration_discovery_snapshots" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id"),
  "migration_project_id" uuid NOT NULL REFERENCES "migration_projects"("id"),
  "counts" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "supported" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "unsupported" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "source_checksum" text NOT NULL,
  "sample" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "migration_discovery_project_idx" ON "migration_discovery_snapshots" ("migration_project_id");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "migration_mapping_profiles" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id"),
  "migration_project_id" uuid NOT NULL REFERENCES "migration_projects"("id"),
  "name" text NOT NULL,
  "mappings" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "version" integer DEFAULT 1 NOT NULL,
  "created_by_user_id" uuid NOT NULL REFERENCES "users"("id"),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "migration_mapping_project_idx" ON "migration_mapping_profiles" ("migration_project_id");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "migration_batches" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id"),
  "migration_project_id" uuid NOT NULL REFERENCES "migration_projects"("id"),
  "mapping_profile_id" uuid REFERENCES "migration_mapping_profiles"("id"),
  "mode" text DEFAULT 'dry_run' NOT NULL,
  "status" text DEFAULT 'queued' NOT NULL,
  "cursor" integer DEFAULT 0 NOT NULL,
  "chunk_size" integer DEFAULT 100 NOT NULL,
  "source_checksum" text NOT NULL,
  "counts" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "errors" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "result" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "started_by_user_id" uuid NOT NULL REFERENCES "users"("id"),
  "started_at" timestamp with time zone DEFAULT now() NOT NULL,
  "finished_at" timestamp with time zone
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "migration_batches_project_idx" ON "migration_batches" ("migration_project_id", "started_at");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "migration_source_references" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id"),
  "migration_project_id" uuid NOT NULL REFERENCES "migration_projects"("id"),
  "source_type" text NOT NULL,
  "source_id" text NOT NULL,
  "source_key" text,
  "source_url" text,
  "target_type" text NOT NULL,
  "target_id" uuid,
  "work_item_id" uuid REFERENCES "work_items"("id"),
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "migration_source_ref_unique" ON "migration_source_references" ("organization_id", "migration_project_id", "source_type", "source_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "migration_source_ref_target_idx" ON "migration_source_references" ("target_type", "target_id");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "devops_repositories" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id"),
  "integration_id" uuid REFERENCES "integrations"("id"),
  "project_id" uuid REFERENCES "projects"("id"),
  "provider" text NOT NULL,
  "external_id" text NOT NULL,
  "name" text NOT NULL,
  "url" text,
  "is_private" boolean DEFAULT true NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "devops_repositories_unique" ON "devops_repositories" ("organization_id", "provider", "external_id");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "development_links" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id"),
  "work_item_id" uuid NOT NULL REFERENCES "work_items"("id"),
  "repository_id" uuid REFERENCES "devops_repositories"("id"),
  "kind" text NOT NULL,
  "external_id" text NOT NULL,
  "url" text,
  "title" text,
  "status" text,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "occurred_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "development_links_unique" ON "development_links" ("organization_id", "kind", "external_id", "work_item_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "development_links_item_idx" ON "development_links" ("work_item_id");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "devops_pull_requests" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id"),
  "repository_id" uuid NOT NULL REFERENCES "devops_repositories"("id"),
  "external_id" text NOT NULL,
  "title" text NOT NULL,
  "url" text,
  "author" text,
  "status" text NOT NULL,
  "reviewers" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "opened_at" timestamp with time zone,
  "merged_at" timestamp with time zone,
  "raw" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "devops_pull_requests_unique" ON "devops_pull_requests" ("repository_id", "external_id");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "devops_builds" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id"),
  "repository_id" uuid REFERENCES "devops_repositories"("id"),
  "external_id" text NOT NULL,
  "status" text NOT NULL,
  "branch" text,
  "commit_sha" text,
  "quality_gate" text,
  "duration_seconds" integer,
  "artifact_url" text,
  "started_at" timestamp with time zone,
  "finished_at" timestamp with time zone,
  "raw" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "devops_builds_unique" ON "devops_builds" ("organization_id", "external_id");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "devops_environments" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id"),
  "project_id" uuid REFERENCES "projects"("id"),
  "name" text NOT NULL,
  "environment_type" text DEFAULT 'production' NOT NULL,
  "protected" boolean DEFAULT false NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "devops_environments_unique" ON "devops_environments" ("organization_id", "project_id", "name");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "devops_deployments" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id"),
  "repository_id" uuid REFERENCES "devops_repositories"("id"),
  "environment_id" uuid REFERENCES "devops_environments"("id"),
  "external_id" text NOT NULL,
  "version" text,
  "status" text NOT NULL,
  "commit_sha" text,
  "approved_by_user_id" uuid REFERENCES "users"("id"),
  "rollback_of_id" uuid,
  "change_set" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "deployed_at" timestamp with time zone,
  "raw" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "devops_deployments_unique" ON "devops_deployments" ("organization_id", "external_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "devops_deployments_environment_idx" ON "devops_deployments" ("environment_id", "deployed_at");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "engineering_feature_flags" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id"),
  "project_id" uuid REFERENCES "projects"("id"),
  "external_id" text NOT NULL,
  "name" text NOT NULL,
  "status" text NOT NULL,
  "environments" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "url" text,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "engineering_feature_flags_unique" ON "engineering_feature_flags" ("organization_id", "external_id");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "devops_security_findings" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id"),
  "repository_id" uuid REFERENCES "devops_repositories"("id"),
  "external_id" text NOT NULL,
  "severity" text NOT NULL,
  "title" text NOT NULL,
  "status" text DEFAULT 'open' NOT NULL,
  "url" text,
  "discovered_at" timestamp with time zone,
  "raw" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "devops_security_findings_unique" ON "devops_security_findings" ("organization_id", "external_id");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "dev_metric_snapshots" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id"),
  "project_id" uuid REFERENCES "projects"("id"),
  "period_start" timestamp with time zone NOT NULL,
  "period_end" timestamp with time zone NOT NULL,
  "deployment_frequency" double precision,
  "lead_time_hours" double precision,
  "change_failure_rate" double precision,
  "restore_time_hours" double precision,
  "review_time_hours" double precision,
  "source" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "dev_metric_snapshots_project_idx" ON "dev_metric_snapshots" ("project_id", "period_start");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "devops_webhook_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id"),
  "integration_id" uuid REFERENCES "integrations"("id"),
  "provider" text NOT NULL,
  "event_id" text NOT NULL,
  "event_type" text NOT NULL,
  "payload_hash" text NOT NULL,
  "status" text DEFAULT 'processed' NOT NULL,
  "received_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "devops_webhook_event_unique" ON "devops_webhook_events" ("organization_id", "provider", "event_id");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "search_connectors" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id"),
  "integration_id" uuid REFERENCES "integrations"("id"),
  "kind" text NOT NULL,
  "name" text NOT NULL,
  "mode" text DEFAULT 'indexed' NOT NULL,
  "status" text DEFAULT 'active' NOT NULL,
  "schedule_cron" text,
  "retention_days" integer DEFAULT 30 NOT NULL,
  "config" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_by_user_id" uuid NOT NULL REFERENCES "users"("id"),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "search_connectors_org_idx" ON "search_connectors" ("organization_id");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "connector_scopes" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id"),
  "connector_id" uuid NOT NULL REFERENCES "search_connectors"("id"),
  "external_scope_id" text NOT NULL,
  "label" text,
  "include" boolean DEFAULT true NOT NULL,
  "rules" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "connector_scopes_unique" ON "connector_scopes" ("connector_id", "external_scope_id");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "indexed_external_objects" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id"),
  "connector_id" uuid NOT NULL REFERENCES "search_connectors"("id"),
  "external_id" text NOT NULL,
  "source_type" text NOT NULL,
  "title" text NOT NULL,
  "snippet" text,
  "deep_link" text,
  "content_hash" text NOT NULL,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "stale" boolean DEFAULT false NOT NULL,
  "source_updated_at" timestamp with time zone,
  "indexed_at" timestamp with time zone DEFAULT now() NOT NULL,
  "expires_at" timestamp with time zone
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "indexed_external_objects_unique" ON "indexed_external_objects" ("connector_id", "external_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "indexed_external_objects_search_idx" ON "indexed_external_objects" ("organization_id", "source_type");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "external_acl_snapshots" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id"),
  "external_object_id" uuid NOT NULL REFERENCES "indexed_external_objects"("id"),
  "principals" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "source_version" text,
  "captured_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "external_acl_snapshots_unique" ON "external_acl_snapshots" ("external_object_id");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "connector_crawl_runs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id"),
  "connector_id" uuid NOT NULL REFERENCES "search_connectors"("id"),
  "status" text DEFAULT 'running' NOT NULL,
  "cursor" text,
  "indexed" integer DEFAULT 0 NOT NULL,
  "removed" integer DEFAULT 0 NOT NULL,
  "failed" integer DEFAULT 0 NOT NULL,
  "errors" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "started_at" timestamp with time zone DEFAULT now() NOT NULL,
  "finished_at" timestamp with time zone
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "crawl_runs_connector_idx" ON "connector_crawl_runs" ("connector_id", "started_at");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "retrieval_citations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id"),
  "user_id" uuid NOT NULL REFERENCES "users"("id"),
  "query" text NOT NULL,
  "external_object_id" uuid NOT NULL REFERENCES "indexed_external_objects"("id"),
  "purpose" text DEFAULT 'search' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "retrieval_citations_user_idx" ON "retrieval_citations" ("organization_id", "user_id", "created_at");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "sandbox_environments" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id"),
  "sandbox_organization_id" uuid NOT NULL REFERENCES "organizations"("id"),
  "name" text NOT NULL,
  "mode" text DEFAULT 'configuration_only' NOT NULL,
  "status" text DEFAULT 'active' NOT NULL,
  "label" text DEFAULT 'SANDBOX' NOT NULL,
  "integrations_restricted" boolean DEFAULT true NOT NULL,
  "email_suppressed" boolean DEFAULT true NOT NULL,
  "masked_sample_data" boolean DEFAULT false NOT NULL,
  "created_by_user_id" uuid NOT NULL REFERENCES "users"("id"),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "sandbox_environments_org_name_unique" ON "sandbox_environments" ("organization_id", "name");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "configuration_packages" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id"),
  "sandbox_id" uuid REFERENCES "sandbox_environments"("id"),
  "name" text NOT NULL,
  "description" text,
  "status" text DEFAULT 'draft' NOT NULL,
  "created_by_user_id" uuid NOT NULL REFERENCES "users"("id"),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "configuration_packages_org_idx" ON "configuration_packages" ("organization_id");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "configuration_package_versions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id"),
  "package_id" uuid NOT NULL REFERENCES "configuration_packages"("id"),
  "version" integer NOT NULL,
  "manifest" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "checksum" text NOT NULL,
  "signature" text NOT NULL,
  "created_by_user_id" uuid NOT NULL REFERENCES "users"("id"),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "configuration_package_version_unique" ON "configuration_package_versions" ("package_id", "version");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "environment_diffs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id"),
  "package_version_id" uuid NOT NULL REFERENCES "configuration_package_versions"("id"),
  "target_organization_id" uuid NOT NULL REFERENCES "organizations"("id"),
  "additions" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "changes" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "removals" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "conflicts" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "dependencies" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "impact" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "calculated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "environment_diffs_version_idx" ON "environment_diffs" ("package_version_id");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "promotion_runs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id"),
  "package_version_id" uuid NOT NULL REFERENCES "configuration_package_versions"("id"),
  "target_organization_id" uuid NOT NULL REFERENCES "organizations"("id"),
  "status" text DEFAULT 'pending_approval' NOT NULL,
  "scheduled_for" timestamp with time zone,
  "approved_by_user_id" uuid REFERENCES "users"("id"),
  "requested_by_user_id" uuid NOT NULL REFERENCES "users"("id"),
  "evidence" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "result" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "started_at" timestamp with time zone,
  "finished_at" timestamp with time zone
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "promotion_runs_target_idx" ON "promotion_runs" ("target_organization_id", "status");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "rollback_packages" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id"),
  "promotion_run_id" uuid NOT NULL REFERENCES "promotion_runs"("id"),
  "payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "checksum" text NOT NULL,
  "applied_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "rollback_packages_run_unique" ON "rollback_packages" ("promotion_run_id");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "service_projects" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id"),
  "project_id" uuid NOT NULL REFERENCES "projects"("id"),
  "key" text NOT NULL,
  "name" text NOT NULL,
  "portal_enabled" boolean DEFAULT true NOT NULL,
  "customer_access" text DEFAULT 'invited' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "service_projects_org_key_unique" ON "service_projects" ("organization_id", "key");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "service_request_types" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id"),
  "service_project_id" uuid NOT NULL REFERENCES "service_projects"("id"),
  "name" text NOT NULL,
  "description" text,
  "work_item_type_key" text DEFAULT 'request' NOT NULL,
  "form_schema" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "default_priority" text DEFAULT 'normal' NOT NULL,
  "active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "service_request_types_project_idx" ON "service_request_types" ("service_project_id");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "service_queues" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id"),
  "service_project_id" uuid NOT NULL REFERENCES "service_projects"("id"),
  "name" text NOT NULL,
  "wql" text NOT NULL,
  "rank" text NOT NULL,
  "created_by_user_id" uuid NOT NULL REFERENCES "users"("id")
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "service_queues_project_name_unique" ON "service_queues" ("service_project_id", "name");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "sla_definitions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id"),
  "service_project_id" uuid NOT NULL REFERENCES "service_projects"("id"),
  "name" text NOT NULL,
  "metric" text NOT NULL,
  "target_minutes" integer NOT NULL,
  "start_condition" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "pause_condition" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "stop_condition" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "calendar" jsonb DEFAULT '{"timezone":"UTC","weekdays":[1,2,3,4,5],"startHour":9,"endHour":17}'::jsonb NOT NULL,
  "version" integer DEFAULT 1 NOT NULL,
  "active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sla_definitions_project_idx" ON "sla_definitions" ("service_project_id");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "sla_clocks" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id"),
  "work_item_id" uuid NOT NULL REFERENCES "work_items"("id"),
  "sla_definition_id" uuid NOT NULL REFERENCES "sla_definitions"("id"),
  "status" text DEFAULT 'running' NOT NULL,
  "started_at" timestamp with time zone NOT NULL,
  "paused_at" timestamp with time zone,
  "stopped_at" timestamp with time zone,
  "elapsed_minutes" integer DEFAULT 0 NOT NULL,
  "paused_minutes" integer DEFAULT 0 NOT NULL,
  "breach_at" timestamp with time zone,
  "history" jsonb DEFAULT '[]'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "sla_clocks_unique" ON "sla_clocks" ("work_item_id", "sla_definition_id");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "service_incidents" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id"),
  "work_item_id" uuid NOT NULL REFERENCES "work_items"("id"),
  "severity" text DEFAULT 'sev3' NOT NULL,
  "status" text DEFAULT 'investigating' NOT NULL,
  "commander_user_id" uuid REFERENCES "users"("id"),
  "responders" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "stakeholder_message" text,
  "timeline" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "post_incident_review" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "resolved_at" timestamp with time zone
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "service_incidents_status_idx" ON "service_incidents" ("organization_id", "status");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "service_problems" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id"),
  "title" text NOT NULL,
  "status" text DEFAULT 'open' NOT NULL,
  "root_cause" text,
  "known_error" text,
  "related_incident_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "service_problems_org_idx" ON "service_problems" ("organization_id");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "service_changes" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id"),
  "work_item_id" uuid REFERENCES "work_items"("id"),
  "title" text NOT NULL,
  "change_type" text DEFAULT 'normal' NOT NULL,
  "status" text DEFAULT 'draft' NOT NULL,
  "risk_score" integer DEFAULT 0 NOT NULL,
  "planned_start" timestamp with time zone,
  "planned_end" timestamp with time zone,
  "cab_approvals" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "deployment_links" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "rollback_plan" text,
  "created_by_user_id" uuid NOT NULL REFERENCES "users"("id"),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "service_changes_status_idx" ON "service_changes" ("organization_id", "status");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "service_alerts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id"),
  "source" text NOT NULL,
  "external_id" text NOT NULL,
  "fingerprint" text NOT NULL,
  "title" text NOT NULL,
  "severity" text NOT NULL,
  "status" text DEFAULT 'open' NOT NULL,
  "occurrences" integer DEFAULT 1 NOT NULL,
  "assigned_user_id" uuid REFERENCES "users"("id"),
  "incident_id" uuid REFERENCES "service_incidents"("id"),
  "acknowledged_at" timestamp with time zone,
  "last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
  "raw" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "service_alerts_source_external_unique" ON "service_alerts" ("organization_id", "source", "external_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "service_alerts_fingerprint_idx" ON "service_alerts" ("organization_id", "fingerprint");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "on_call_schedules" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id"),
  "name" text NOT NULL,
  "timezone" text DEFAULT 'UTC' NOT NULL,
  "rotations" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "escalation_policy" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "on_call_schedules_org_name_unique" ON "on_call_schedules" ("organization_id", "name");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "asset_schemas" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id"),
  "name" text NOT NULL,
  "object_types" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "field_definitions" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "asset_schemas_org_name_unique" ON "asset_schemas" ("organization_id", "name");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "configuration_items" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id"),
  "schema_id" uuid NOT NULL REFERENCES "asset_schemas"("id"),
  "object_type" text NOT NULL,
  "key" text NOT NULL,
  "name" text NOT NULL,
  "status" text DEFAULT 'active' NOT NULL,
  "attributes" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "sensitive" boolean DEFAULT false NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "configuration_items_schema_key_unique" ON "configuration_items" ("schema_id", "key");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "configuration_items_type_idx" ON "configuration_items" ("organization_id", "object_type");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "service_relations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id"),
  "from_item_id" uuid NOT NULL REFERENCES "configuration_items"("id"),
  "to_item_id" uuid NOT NULL REFERENCES "configuration_items"("id"),
  "relation_type" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "service_relations_unique" ON "service_relations" ("from_item_id", "to_item_id", "relation_type");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "discovery_customers" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id"),
  "name" text NOT NULL,
  "external_ref" text,
  "segment" text,
  "weight" double precision DEFAULT 1 NOT NULL,
  "consent_status" text DEFAULT 'unknown' NOT NULL,
  "retention_until" timestamp with time zone,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "discovery_customers_org_idx" ON "discovery_customers" ("organization_id");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "discovery_ideas" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id"),
  "parent_idea_id" uuid,
  "kind" text DEFAULT 'idea' NOT NULL,
  "title" text NOT NULL,
  "description" text,
  "status" text DEFAULT 'new' NOT NULL,
  "owner_user_id" uuid REFERENCES "users"("id"),
  "impact" double precision DEFAULT 0 NOT NULL,
  "confidence" double precision DEFAULT 0 NOT NULL,
  "effort" double precision DEFAULT 1 NOT NULL,
  "reach" double precision DEFAULT 0 NOT NULL,
  "customer_weight" double precision DEFAULT 1 NOT NULL,
  "score" double precision DEFAULT 0 NOT NULL,
  "tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "created_by_user_id" uuid NOT NULL REFERENCES "users"("id"),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "discovery_ideas_status_idx" ON "discovery_ideas" ("organization_id", "status");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "discovery_insights" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id"),
  "customer_id" uuid REFERENCES "discovery_customers"("id"),
  "source_type" text NOT NULL,
  "source_ref" text,
  "title" text NOT NULL,
  "body" text NOT NULL,
  "theme" text,
  "dedupe_hash" text NOT NULL,
  "private" boolean DEFAULT false NOT NULL,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_by_user_id" uuid NOT NULL REFERENCES "users"("id"),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "discovery_insights_dedupe_unique" ON "discovery_insights" ("organization_id", "dedupe_hash");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "discovery_insights_org_idx" ON "discovery_insights" ("organization_id", "created_at");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "discovery_idea_insights" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id"),
  "idea_id" uuid NOT NULL REFERENCES "discovery_ideas"("id"),
  "insight_id" uuid NOT NULL REFERENCES "discovery_insights"("id"),
  "relevance" double precision DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "discovery_idea_insights_unique" ON "discovery_idea_insights" ("idea_id", "insight_id");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "discovery_votes" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id"),
  "idea_id" uuid NOT NULL REFERENCES "discovery_ideas"("id"),
  "user_id" uuid NOT NULL REFERENCES "users"("id"),
  "value" integer DEFAULT 1 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "discovery_votes_unique" ON "discovery_votes" ("idea_id", "user_id");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "prioritisation_formulas" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id"),
  "name" text NOT NULL,
  "kind" text DEFAULT 'rice' NOT NULL,
  "weights" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "active" boolean DEFAULT true NOT NULL,
  "created_by_user_id" uuid NOT NULL REFERENCES "users"("id"),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "prioritisation_formulas_org_name_unique" ON "prioritisation_formulas" ("organization_id", "name");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "discovery_delivery_links" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id"),
  "idea_id" uuid NOT NULL REFERENCES "discovery_ideas"("id"),
  "project_id" uuid REFERENCES "projects"("id"),
  "work_item_id" uuid REFERENCES "work_items"("id"),
  "relation" text DEFAULT 'delivered_by' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "discovery_delivery_links_unique" ON "discovery_delivery_links" ("idea_id", "project_id", "work_item_id");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "roadmap_publications" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id"),
  "name" text NOT NULL,
  "token_hash" text NOT NULL,
  "fields" jsonb DEFAULT '["title","status"]'::jsonb NOT NULL,
  "filters" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "version" integer DEFAULT 1 NOT NULL,
  "active" boolean DEFAULT true NOT NULL,
  "expires_at" timestamp with time zone,
  "view_count" integer DEFAULT 0 NOT NULL,
  "created_by_user_id" uuid NOT NULL REFERENCES "users"("id"),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "roadmap_publications_token_unique" ON "roadmap_publications" ("token_hash");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "communication_mailboxes" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id"),
  "integration_id" uuid REFERENCES "integrations"("id"),
  "project_id" uuid REFERENCES "projects"("id"),
  "address" text NOT NULL,
  "name" text NOT NULL,
  "status" text DEFAULT 'active' NOT NULL,
  "routing_rules" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_by_user_id" uuid NOT NULL REFERENCES "users"("id"),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "communication_mailboxes_address_unique" ON "communication_mailboxes" ("organization_id", "address");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "communication_email_threads" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id"),
  "mailbox_id" uuid NOT NULL REFERENCES "communication_mailboxes"("id"),
  "work_item_id" uuid REFERENCES "work_items"("id"),
  "subject" text NOT NULL,
  "external_thread_id" text,
  "participants" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "status" text DEFAULT 'open' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "communication_email_threads_item_idx" ON "communication_email_threads" ("work_item_id");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "communication_email_messages" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id"),
  "thread_id" uuid NOT NULL REFERENCES "communication_email_threads"("id"),
  "direction" text NOT NULL,
  "external_message_id" text NOT NULL,
  "from_address" text NOT NULL,
  "to_addresses" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "body_text" text,
  "attachments" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "authenticity" text DEFAULT 'unknown' NOT NULL,
  "delivery_status" text DEFAULT 'received' NOT NULL,
  "raw_headers" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "sent_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "communication_email_messages_external_unique" ON "communication_email_messages" ("organization_id", "external_message_id");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "calendar_connections" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id"),
  "integration_id" uuid REFERENCES "integrations"("id"),
  "user_id" uuid NOT NULL REFERENCES "users"("id"),
  "provider" text NOT NULL,
  "calendar_external_id" text NOT NULL,
  "sync_token" text,
  "status" text DEFAULT 'active' NOT NULL,
  "last_sync_at" timestamp with time zone
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "calendar_connections_unique" ON "calendar_connections" ("organization_id", "user_id", "provider", "calendar_external_id");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "calendar_event_links" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id"),
  "connection_id" uuid NOT NULL REFERENCES "calendar_connections"("id"),
  "work_item_id" uuid REFERENCES "work_items"("id"),
  "external_event_id" text NOT NULL,
  "title" text NOT NULL,
  "start_at" timestamp with time zone NOT NULL,
  "end_at" timestamp with time zone NOT NULL,
  "sync_version" text,
  "last_source" text DEFAULT 'external' NOT NULL,
  "conflict" jsonb,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "calendar_event_links_unique" ON "calendar_event_links" ("connection_id", "external_event_id");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "communication_clips" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id"),
  "project_id" uuid REFERENCES "projects"("id"),
  "work_item_id" uuid REFERENCES "work_items"("id"),
  "title" text NOT NULL,
  "media_ref" text NOT NULL,
  "duration_seconds" integer DEFAULT 0 NOT NULL,
  "consent" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "retention_until" timestamp with time zone,
  "created_by_user_id" uuid NOT NULL REFERENCES "users"("id"),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "communication_clips_item_idx" ON "communication_clips" ("work_item_id");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "communication_transcripts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id"),
  "clip_id" uuid REFERENCES "communication_clips"("id"),
  "language" text DEFAULT 'en' NOT NULL,
  "segments" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "summary" text,
  "decisions" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "proposed_actions" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "communication_transcripts_clip_idx" ON "communication_transcripts" ("clip_id");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "communication_sync_sessions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id"),
  "kind" text NOT NULL,
  "connection_id" uuid,
  "status" text DEFAULT 'running' NOT NULL,
  "cursor_before" text,
  "cursor_after" text,
  "summary" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "started_at" timestamp with time zone DEFAULT now() NOT NULL,
  "finished_at" timestamp with time zone
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "communication_sync_sessions_idx" ON "communication_sync_sessions" ("organization_id", "kind", "started_at");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "meeting_captures" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id"),
  "project_id" uuid REFERENCES "projects"("id"),
  "title" text NOT NULL,
  "start_at" timestamp with time zone,
  "attendees" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "transcript_id" uuid REFERENCES "communication_transcripts"("id"),
  "summary" text,
  "action_review_status" text DEFAULT 'pending' NOT NULL,
  "created_by_user_id" uuid NOT NULL REFERENCES "users"("id"),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "meeting_captures_org_idx" ON "meeting_captures" ("organization_id", "created_at");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "personal_notes" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id"),
  "user_id" uuid NOT NULL REFERENCES "users"("id"),
  "title" text NOT NULL,
  "body" text DEFAULT '' NOT NULL,
  "pinned" boolean DEFAULT false NOT NULL,
  "shared" boolean DEFAULT false NOT NULL,
  "retention_until" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "personal_notes_user_idx" ON "personal_notes" ("organization_id", "user_id", "updated_at");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "personal_reminders" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id"),
  "user_id" uuid NOT NULL REFERENCES "users"("id"),
  "work_item_id" uuid REFERENCES "work_items"("id"),
  "title" text NOT NULL,
  "due_at" timestamp with time zone NOT NULL,
  "timezone" text DEFAULT 'UTC' NOT NULL,
  "recurrence" text,
  "status" text DEFAULT 'open' NOT NULL,
  "snoozed_until" timestamp with time zone,
  "delegated_to_user_id" uuid REFERENCES "users"("id"),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "personal_reminders_user_due_idx" ON "personal_reminders" ("organization_id", "user_id", "due_at");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "mind_maps" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id"),
  "owner_user_id" uuid NOT NULL REFERENCES "users"("id"),
  "project_id" uuid REFERENCES "projects"("id"),
  "name" text NOT NULL,
  "source_type" text DEFAULT 'free' NOT NULL,
  "source_id" uuid,
  "shared" boolean DEFAULT false NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "mind_maps_owner_idx" ON "mind_maps" ("organization_id", "owner_user_id");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "mind_map_nodes" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id"),
  "mind_map_id" uuid NOT NULL REFERENCES "mind_maps"("id"),
  "parent_node_id" uuid,
  "work_item_id" uuid REFERENCES "work_items"("id"),
  "label" text NOT NULL,
  "x" double precision DEFAULT 0 NOT NULL,
  "y" double precision DEFAULT 0 NOT NULL,
  "style" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "rank" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "mind_map_nodes_map_idx" ON "mind_map_nodes" ("mind_map_id");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "location_projections" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id"),
  "work_item_id" uuid NOT NULL REFERENCES "work_items"("id"),
  "latitude" double precision NOT NULL,
  "longitude" double precision NOT NULL,
  "label" text,
  "precision" text DEFAULT 'exact' NOT NULL,
  "sensitive" boolean DEFAULT false NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "location_projections_item_unique" ON "location_projections" ("work_item_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "location_projections_geo_idx" ON "location_projections" ("organization_id", "latitude", "longitude");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "browser_captures" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id"),
  "user_id" uuid NOT NULL REFERENCES "users"("id"),
  "target_type" text NOT NULL,
  "target_id" uuid,
  "url" text NOT NULL,
  "title" text,
  "selected_text" text,
  "screenshot_ref" text,
  "status" text DEFAULT 'captured' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "browser_captures_user_idx" ON "browser_captures" ("organization_id", "user_id", "created_at");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "device_registrations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id"),
  "user_id" uuid NOT NULL REFERENCES "users"("id"),
  "device_id" text NOT NULL,
  "platform" text NOT NULL,
  "push_token_hash" text,
  "client_version" text,
  "status" text DEFAULT 'active' NOT NULL,
  "last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
  "revoked_at" timestamp with time zone
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "device_registrations_unique" ON "device_registrations" ("organization_id", "user_id", "device_id");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "offline_queue" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id"),
  "user_id" uuid NOT NULL REFERENCES "users"("id"),
  "device_id" text NOT NULL,
  "operation_key" text NOT NULL,
  "action" text NOT NULL,
  "payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "base_version" integer,
  "status" text DEFAULT 'pending' NOT NULL,
  "conflict" jsonb,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "processed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "offline_queue_operation_unique" ON "offline_queue" ("organization_id", "user_id", "device_id", "operation_key");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "offline_queue_device_idx" ON "offline_queue" ("device_id", "status");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "ai_teammates" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id"),
  "name" text NOT NULL,
  "role" text NOT NULL,
  "skills" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "allowed_project_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "human_owner_user_id" uuid NOT NULL REFERENCES "users"("id"),
  "provider" text DEFAULT 'default' NOT NULL,
  "model" text,
  "active" boolean DEFAULT true NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "ai_teammates_org_name_unique" ON "ai_teammates" ("organization_id", "name");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "agent_policies" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id"),
  "teammate_id" uuid NOT NULL REFERENCES "ai_teammates"("id"),
  "allowed_actions" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "destructive_actions" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "external_send_requires_checkpoint" boolean DEFAULT true NOT NULL,
  "mass_mutation_limit" integer DEFAULT 10 NOT NULL,
  "max_run_tokens" integer DEFAULT 10000 NOT NULL,
  "max_daily_tokens" integer DEFAULT 50000 NOT NULL,
  "retention_days" integer DEFAULT 30 NOT NULL,
  "updated_by_user_id" uuid NOT NULL REFERENCES "users"("id"),
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "agent_policies_teammate_unique" ON "agent_policies" ("teammate_id");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "agent_tool_grants" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id"),
  "teammate_id" uuid NOT NULL REFERENCES "ai_teammates"("id"),
  "tool_key" text NOT NULL,
  "scope" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "enabled" boolean DEFAULT true NOT NULL,
  "granted_by_user_id" uuid NOT NULL REFERENCES "users"("id"),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "agent_tool_grants_unique" ON "agent_tool_grants" ("teammate_id", "tool_key");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "agent_runs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id"),
  "teammate_id" uuid NOT NULL REFERENCES "ai_teammates"("id"),
  "initiated_by_user_id" uuid NOT NULL REFERENCES "users"("id"),
  "work_item_id" uuid REFERENCES "work_items"("id"),
  "task" text NOT NULL,
  "status" text DEFAULT 'running' NOT NULL,
  "input" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "output" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "citations" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "tool_calls" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "timeline" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "tokens_used" integer DEFAULT 0 NOT NULL,
  "cost_micros" integer DEFAULT 0 NOT NULL,
  "quality_score" integer,
  "error" text,
  "started_at" timestamp with time zone DEFAULT now() NOT NULL,
  "finished_at" timestamp with time zone
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "agent_runs_teammate_idx" ON "agent_runs" ("teammate_id", "started_at");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "ai_memory_records" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id"),
  "teammate_id" uuid NOT NULL REFERENCES "ai_teammates"("id"),
  "workspace_id" uuid REFERENCES "workspaces"("id"),
  "project_id" uuid REFERENCES "projects"("id"),
  "scope_type" text DEFAULT 'project' NOT NULL,
  "memory_key" text NOT NULL,
  "content" text NOT NULL,
  "source_refs" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "retention_until" timestamp with time zone,
  "created_by_user_id" uuid NOT NULL REFERENCES "users"("id"),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ai_memory_scope_idx" ON "ai_memory_records" ("organization_id", "teammate_id", "scope_type", "project_id");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "human_checkpoints" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id"),
  "agent_run_id" uuid NOT NULL REFERENCES "agent_runs"("id"),
  "action_key" text NOT NULL,
  "proposal" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "status" text DEFAULT 'pending' NOT NULL,
  "required_role_key" text,
  "decided_by_user_id" uuid REFERENCES "users"("id"),
  "decision_reason" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "decided_at" timestamp with time zone
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "human_checkpoints_run_idx" ON "human_checkpoints" ("agent_run_id", "status");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "ai_usage_budgets" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id"),
  "teammate_id" uuid REFERENCES "ai_teammates"("id"),
  "period" text DEFAULT 'monthly' NOT NULL,
  "token_limit" integer DEFAULT 100000 NOT NULL,
  "token_used" integer DEFAULT 0 NOT NULL,
  "cost_limit_micros" integer DEFAULT 0 NOT NULL,
  "cost_used_micros" integer DEFAULT 0 NOT NULL,
  "period_start" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "ai_usage_budgets_unique" ON "ai_usage_budgets" ("organization_id", "teammate_id", "period", "period_start");
--> statement-breakpoint

