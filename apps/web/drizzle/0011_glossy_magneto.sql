ALTER TABLE "churches" ALTER COLUMN "default_translation" SET DEFAULT 'WEB';--> statement-breakpoint
ALTER TABLE "live_state" ADD COLUMN "translation" text;--> statement-breakpoint
ALTER TABLE "live_state" ADD COLUMN "book" text;--> statement-breakpoint
ALTER TABLE "live_state" ADD COLUMN "chapter" integer;--> statement-breakpoint
ALTER TABLE "live_state" ADD COLUMN "verse" integer;