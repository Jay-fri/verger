CREATE TYPE "public"."live_state_source" AS ENUM('cue', 'detection', 'search');--> statement-breakpoint
CREATE TABLE "live_state" (
	"service_id" uuid PRIMARY KEY NOT NULL,
	"source" "live_state_source" NOT NULL,
	"type" "cue_item_type" NOT NULL,
	"label" text NOT NULL,
	"text" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "live_state" ADD CONSTRAINT "live_state_service_id_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE cascade ON UPDATE no action;