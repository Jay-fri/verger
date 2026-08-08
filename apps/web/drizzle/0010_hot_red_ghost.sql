CREATE TYPE "public"."cue_section" AS ENUM('pre_service', 'warm_up', 'service', 'post_service');--> statement-breakpoint
CREATE TYPE "public"."display_mode" AS ENUM('auto', 'manual');--> statement-breakpoint
CREATE TYPE "public"."live_state_mode" AS ENUM('content', 'clear', 'black', 'logo');--> statement-breakpoint
ALTER TABLE "churches" ADD COLUMN "logo_data_url" text;--> statement-breakpoint
ALTER TABLE "cue_items" ADD COLUMN "section" "cue_section" DEFAULT 'service' NOT NULL;--> statement-breakpoint
ALTER TABLE "cue_items" ADD COLUMN "song_section_id" uuid;--> statement-breakpoint
ALTER TABLE "live_state" ADD COLUMN "mode" "live_state_mode" DEFAULT 'content' NOT NULL;--> statement-breakpoint
ALTER TABLE "live_state" ADD COLUMN "next_label" text;--> statement-breakpoint
ALTER TABLE "live_state" ADD COLUMN "next_text" text;--> statement-breakpoint
ALTER TABLE "live_state" ADD COLUMN "next_type" "cue_item_type";--> statement-breakpoint
ALTER TABLE "live_state" ADD COLUMN "operator_message" text;--> statement-breakpoint
ALTER TABLE "services" ADD COLUMN "display_mode" "display_mode" DEFAULT 'auto' NOT NULL;--> statement-breakpoint
ALTER TABLE "songs" ADD COLUMN "last_arrangement" text[];--> statement-breakpoint
ALTER TABLE "cue_items" ADD CONSTRAINT "cue_items_song_section_id_song_sections_id_fk" FOREIGN KEY ("song_section_id") REFERENCES "public"."song_sections"("id") ON DELETE set null ON UPDATE no action;