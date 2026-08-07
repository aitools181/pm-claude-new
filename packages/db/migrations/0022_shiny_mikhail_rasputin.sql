CREATE TABLE IF NOT EXISTS "whiteboard_elements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"whiteboard_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"x" double precision DEFAULT 0 NOT NULL,
	"y" double precision DEFAULT 0 NOT NULL,
	"w" double precision DEFAULT 120 NOT NULL,
	"h" double precision DEFAULT 80 NOT NULL,
	"data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_work_item_id" uuid,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "whiteboards" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" text NOT NULL,
	"created_by_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "whiteboard_elements" ADD CONSTRAINT "whiteboard_elements_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "whiteboard_elements" ADD CONSTRAINT "whiteboard_elements_whiteboard_id_whiteboards_id_fk" FOREIGN KEY ("whiteboard_id") REFERENCES "public"."whiteboards"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "whiteboard_elements" ADD CONSTRAINT "whiteboard_elements_created_work_item_id_work_items_id_fk" FOREIGN KEY ("created_work_item_id") REFERENCES "public"."work_items"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "whiteboards" ADD CONSTRAINT "whiteboards_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "whiteboards" ADD CONSTRAINT "whiteboards_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "whiteboard_elements_board_idx" ON "whiteboard_elements" USING btree ("whiteboard_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "whiteboards_org_idx" ON "whiteboards" USING btree ("organization_id");