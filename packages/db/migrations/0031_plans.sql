-- Commercial plans and per-organization entitlements.
CREATE TABLE IF NOT EXISTS "plans" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "key" text NOT NULL,
  "name" text NOT NULL,
  "description" text,
  "currency" text DEFAULT 'INR' NOT NULL,
  "price_monthly" integer DEFAULT 0 NOT NULL,
  "price_yearly" integer DEFAULT 0 NOT NULL,
  "limits" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "modules" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "is_public" boolean DEFAULT true NOT NULL,
  "sort_order" integer DEFAULT 0 NOT NULL,
  "status" text DEFAULT 'active' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_by_user_id" uuid
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "organization_plans" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL,
  "plan_key" text NOT NULL,
  "status" text DEFAULT 'active' NOT NULL,
  "seats" integer,
  "started_at" timestamp with time zone DEFAULT now() NOT NULL,
  "current_period_end" timestamp with time zone,
  "assigned_by_user_id" uuid
);
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "plans" ADD CONSTRAINT "plans_updated_by_user_id_users_id_fk"
    FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "organization_plans" ADD CONSTRAINT "organization_plans_organization_id_organizations_id_fk"
    FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "organization_plans" ADD CONSTRAINT "organization_plans_assigned_by_user_id_users_id_fk"
    FOREIGN KEY ("assigned_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "plans_key_unique" ON "plans" USING btree ("key");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "organization_plans_org_unique" ON "organization_plans" USING btree ("organization_id");
