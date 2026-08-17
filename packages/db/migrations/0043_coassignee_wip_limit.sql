-- 0043_coassignee_wip_limit.sql
-- ASN.D1 co-assignee org toggle (default OFF); VIEW.D3 board WIP limits.
--
-- WIP limits are stored on projects (keyed by status category: todo|in_progress|done)
-- rather than on sections, because the Board view is a fixed 3-column board driven
-- by status category, not by the "sections" table (sections back List-view grouping).

ALTER TABLE "organization_settings" ADD COLUMN IF NOT EXISTS "co_assignees_enabled" boolean DEFAULT false NOT NULL;
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "wip_limits" jsonb;
