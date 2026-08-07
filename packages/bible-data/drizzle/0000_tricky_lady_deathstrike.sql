CREATE EXTENSION IF NOT EXISTS vector;
--> statement-breakpoint
CREATE TABLE "verses" (
	"id" serial PRIMARY KEY NOT NULL,
	"translation" text NOT NULL,
	"book" text NOT NULL,
	"chapter" integer NOT NULL,
	"verse" integer NOT NULL,
	"text" text NOT NULL,
	"embedding" vector(384),
	CONSTRAINT "verses_translation_book_chapter_verse_unique" UNIQUE("translation","book","chapter","verse")
);
--> statement-breakpoint
CREATE INDEX "verses_translation_book_chapter_idx" ON "verses" USING btree ("translation","book","chapter");