CREATE TABLE IF NOT EXISTS "work_item_key_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"work_item_id" uuid NOT NULL,
	"old_key" text NOT NULL,
	"old_project_id" uuid,
	"new_key" text NOT NULL,
	"reason" text,
	"actor_user_id" uuid,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "work_item_key_history" ADD CONSTRAINT "work_item_key_history_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "work_item_key_history" ADD CONSTRAINT "work_item_key_history_work_item_id_work_items_id_fk" FOREIGN KEY ("work_item_id") REFERENCES "public"."work_items"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "work_item_key_history" ADD CONSTRAINT "work_item_key_history_old_project_id_projects_id_fk" FOREIGN KEY ("old_project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "work_item_key_history" ADD CONSTRAINT "work_item_key_history_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "key_history_item_idx" ON "work_item_key_history" USING btree ("work_item_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "key_history_oldkey_idx" ON "work_item_key_history" USING btree ("organization_id","old_key");