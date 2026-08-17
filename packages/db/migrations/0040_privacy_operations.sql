-- 0040_privacy_operations.sql
-- X03: Data Subject Requests, Legal Hold, Consent register, Anonymisation audit.

CREATE TABLE IF NOT EXISTS "data_subject_requests" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id"),
  "subject_user_id" uuid NOT NULL REFERENCES "users"("id"),
  "requested_by_user_id" uuid NOT NULL REFERENCES "users"("id"),
  "request_type" text NOT NULL,
  "status" text DEFAULT 'intake' NOT NULL,
  "sla_deadline" timestamptz NOT NULL,
  "verified_at" timestamptz,
  "completed_at" timestamptz,
  "notes" text,
  "export_manifest" jsonb,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "dsr_org_idx" ON "data_subject_requests" ("organization_id", "status");
CREATE INDEX IF NOT EXISTS "dsr_subject_idx" ON "data_subject_requests" ("subject_user_id");

CREATE TABLE IF NOT EXISTS "legal_holds" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id"),
  "scope" text NOT NULL,
  "scope_user_id" uuid REFERENCES "users"("id"),
  "scope_project_id" uuid REFERENCES "projects"("id"),
  "date_from" date,
  "date_to" date,
  "reason" text NOT NULL,
  "created_by_user_id" uuid NOT NULL REFERENCES "users"("id"),
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "released_at" timestamptz,
  "released_by_user_id" uuid REFERENCES "users"("id"),
  "release_approved_by_user_id" uuid REFERENCES "users"("id")
);
CREATE INDEX IF NOT EXISTS "legal_hold_org_idx" ON "legal_holds" ("organization_id", "released_at");

CREATE TABLE IF NOT EXISTS "consent_records" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id"),
  "user_id" uuid NOT NULL REFERENCES "users"("id"),
  "purpose" text NOT NULL,
  "version" text NOT NULL,
  "granted_at" timestamptz DEFAULT now() NOT NULL,
  "withdrawn_at" timestamptz
);
CREATE INDEX IF NOT EXISTS "consent_user_idx" ON "consent_records" ("organization_id", "user_id", "purpose");

CREATE TABLE IF NOT EXISTS "anonymisation_runs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id"),
  "target_user_id" uuid NOT NULL REFERENCES "users"("id"),
  "performed_by_user_id" uuid NOT NULL REFERENCES "users"("id"),
  "fields_affected" jsonb NOT NULL,
  "dsr_request_id" uuid REFERENCES "data_subject_requests"("id"),
  "performed_at" timestamptz DEFAULT now() NOT NULL
);
