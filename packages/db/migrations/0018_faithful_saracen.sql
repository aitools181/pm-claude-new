CREATE TABLE IF NOT EXISTS "restore_drills" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"backup_run_id" uuid NOT NULL,
	"target" text DEFAULT 'fresh' NOT NULL,
	"status" text DEFAULT 'running' NOT NULL,
	"checksums_ok" boolean DEFAULT false NOT NULL,
	"reconciled" boolean DEFAULT false NOT NULL,
	"app_started" boolean DEFAULT false NOT NULL,
	"rpo_seconds" integer,
	"rto_seconds" integer,
	"reconciliation" jsonb,
	"evidence" jsonb,
	"scheduled_label" text,
	"notes" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "restore_drills" ADD CONSTRAINT "restore_drills_backup_run_id_backup_runs_id_fk" FOREIGN KEY ("backup_run_id") REFERENCES "public"."backup_runs"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "restore_drills_backup_idx" ON "restore_drills" USING btree ("backup_run_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "restore_drills_status_idx" ON "restore_drills" USING btree ("status","started_at");