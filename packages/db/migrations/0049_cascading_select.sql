-- 0049_cascading_select.sql
-- FIELD.D2 cascading select fields.

ALTER TABLE "custom_field_definitions" ADD COLUMN IF NOT EXISTS "cascade_parent_field_id" uuid;
ALTER TABLE "custom_field_options" ADD COLUMN IF NOT EXISTS "parent_option_id" uuid;
