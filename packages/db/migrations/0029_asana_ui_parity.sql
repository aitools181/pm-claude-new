-- Asana-style UX parity: personalization, saved views, project overview/share state and task actions.
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "description" text;
--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "color" text DEFAULT '#5b5fc7' NOT NULL;
--> statement-breakpoint
ALTER TABLE "project_members" ADD COLUMN IF NOT EXISTS "access_level" text DEFAULT 'editor' NOT NULL;
--> statement-breakpoint
ALTER TABLE "project_members" ADD COLUMN IF NOT EXISTS "notify_tasks" boolean DEFAULT true NOT NULL;
--> statement-breakpoint
ALTER TABLE "work_items" ADD COLUMN IF NOT EXISTS "public_to_organization" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN IF NOT EXISTS "bookmarked_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN IF NOT EXISTS "archived_at" timestamp with time zone;
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "user_ui_preferences" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id"),
  "user_id" uuid NOT NULL REFERENCES "users"("id"),
  "theme_mode" text DEFAULT 'light' NOT NULL,
  "chrome_tone" text DEFAULT 'black' NOT NULL,
  "color_preset" text DEFAULT 'asana' NOT NULL,
  "custom_accent" text,
  "home_background" text DEFAULT 'sunset' NOT NULL,
  "density" text DEFAULT 'comfortable' NOT NULL,
  "locale" text DEFAULT 'en' NOT NULL,
  "custom_theme" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "user_ui_preferences_unique" ON "user_ui_preferences" ("organization_id","user_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "user_home_widgets" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id"),
  "user_id" uuid NOT NULL REFERENCES "users"("id"),
  "widget_key" text NOT NULL,
  "enabled" boolean DEFAULT true NOT NULL,
  "sort_order" integer DEFAULT 0 NOT NULL,
  "size" text DEFAULT 'medium' NOT NULL,
  "config" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "user_home_widgets_unique" ON "user_home_widgets" ("organization_id","user_id","widget_key");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "user_home_widgets_user_idx" ON "user_home_widgets" ("organization_id","user_id","sort_order");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "saved_ui_views" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id"),
  "user_id" uuid NOT NULL REFERENCES "users"("id"),
  "scope_type" text NOT NULL,
  "scope_id" uuid,
  "name" text NOT NULL,
  "view_type" text DEFAULT 'list' NOT NULL,
  "filters" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "columns" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "sort_spec" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "group_by" text,
  "is_default" boolean DEFAULT false NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "saved_ui_views_scope_idx" ON "saved_ui_views" ("organization_id","user_id","scope_type","scope_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "project_favorites" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id"),
  "user_id" uuid NOT NULL REFERENCES "users"("id"),
  "project_id" uuid NOT NULL REFERENCES "projects"("id"),
  "rank" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "project_favorites_unique" ON "project_favorites" ("organization_id","user_id","project_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "project_status_updates" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id"),
  "project_id" uuid NOT NULL REFERENCES "projects"("id"),
  "author_user_id" uuid NOT NULL REFERENCES "users"("id"),
  "health" text NOT NULL,
  "title" text NOT NULL,
  "body" text DEFAULT '' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "project_status_updates_project_idx" ON "project_status_updates" ("project_id","created_at");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "project_resources" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id"),
  "project_id" uuid NOT NULL REFERENCES "projects"("id"),
  "kind" text DEFAULT 'link' NOT NULL,
  "name" text NOT NULL,
  "url" text,
  "body" text,
  "rank" integer DEFAULT 0 NOT NULL,
  "created_by" uuid REFERENCES "users"("id"),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "project_resources_project_idx" ON "project_resources" ("project_id","rank");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "work_item_likes" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id"),
  "work_item_id" uuid NOT NULL REFERENCES "work_items"("id"),
  "user_id" uuid NOT NULL REFERENCES "users"("id"),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "work_item_likes_unique" ON "work_item_likes" ("organization_id","work_item_id","user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "work_item_likes_item_idx" ON "work_item_likes" ("work_item_id");

--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "user_email_forwarding" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id"),
  "user_id" uuid NOT NULL REFERENCES "users"("id"),
  "address" text NOT NULL,
  "enabled" boolean DEFAULT true NOT NULL,
  "destination_project_id" uuid REFERENCES "projects"("id"),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "user_email_forwarding_unique" ON "user_email_forwarding" ("organization_id","user_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "user_email_forwarding_address_unique" ON "user_email_forwarding" ("address");

CREATE TABLE IF NOT EXISTS project_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  project_id uuid NOT NULL REFERENCES projects(id),
  author_user_id uuid NOT NULL REFERENCES users(id),
  subject text NOT NULL,
  body text NOT NULL DEFAULT '',
  pinned boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS project_messages_project_idx ON project_messages(organization_id, project_id, created_at);
