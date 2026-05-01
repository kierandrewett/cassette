CREATE TYPE "public"."privacy_mode" AS ENUM('public', 'login-required', 'login-only');--> statement-breakpoint
CREATE TABLE "site_config" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"privacy_mode" "privacy_mode" DEFAULT 'public' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by_id" text,
	CONSTRAINT "site_config_single_row" CHECK ("site_config"."id" = 1)
);
--> statement-breakpoint
ALTER TABLE "site_config" ADD CONSTRAINT "site_config_updated_by_id_user_id_fk" FOREIGN KEY ("updated_by_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
INSERT INTO "site_config" ("id", "privacy_mode") VALUES (1, 'public') ON CONFLICT ("id") DO NOTHING;