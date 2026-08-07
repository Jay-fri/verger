import { index, integer, pgTable, serial, text, unique, vector } from "drizzle-orm/pg-core";
import { EMBEDDING_DIMENSIONS } from "../embeddings";

export const verses = pgTable(
  "verses",
  {
    id: serial("id").primaryKey(),
    /** Translation code, e.g. "WEB". A licensed translation (NIV/ESV/etc.) needs its own rights check before production use — see README. */
    translation: text("translation").notNull(),
    /** Canonical book code from src/books.ts, e.g. "JHN". */
    book: text("book").notNull(),
    chapter: integer("chapter").notNull(),
    verse: integer("verse").notNull(),
    text: text("text").notNull(),
    /** Null until src/ingest/run-embed.ts has processed this row. */
    embedding: vector("embedding", { dimensions: EMBEDDING_DIMENSIONS }),
  },
  (table) => [
    unique("verses_translation_book_chapter_verse_unique").on(
      table.translation,
      table.book,
      table.chapter,
      table.verse,
    ),
    index("verses_translation_book_chapter_idx").on(
      table.translation,
      table.book,
      table.chapter,
    ),
  ],
);
