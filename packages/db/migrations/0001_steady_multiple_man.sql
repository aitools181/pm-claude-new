CREATE TABLE IF NOT EXISTS "reschedule_operations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"trigger_item_id" uuid NOT NULL,
	"actor_user_id" uuid NOT NULL,
	"before" jsonb NOT NULL,
	"after" jsonb NOT NULL,
	"undone" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "work_items" ADD COLUMN "duration_days" integer;--> statement-breakpoint
ALTER TABLE "work_items" ADD COLUMN "schedule_mode" text DEFAULT 'manual' NOT NULL;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "reschedule_operations" ADD CONSTRAINT "reschedule_operations_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "reschedule_operations" ADD CONSTRAINT "reschedule_operations_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "reschedule_operations" ADD CONSTRAINT "reschedule_operations_trigger_item_id_work_items_id_fk" FOREIGN KEY ("trigger_item_id") REFERENCES "public"."work_items"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
