import { desc, eq, sql } from "drizzle-orm";
import { getDb } from "./db";
import { verses } from "./db/schema";
import { embedText } from "./embeddings";

export type SemanticMatch = {
  translation: string;
  book: string;
  chapter: number;
  verse: number;
  text: string;
  /** Cosine similarity, roughly 0-1 for related text (1 = identical). */
  similarity: number;
};

export const DEFAULT_TRANSLATION = "WEB";
const DEFAULT_LIMIT = 5;

export async function semanticSearch(
  query: string,
  opts?: { translation?: string; limit?: number },
): Promise<SemanticMatch[]> {
  const translation = opts?.translation ?? DEFAULT_TRANSLATION;
  const limit = opts?.limit ?? DEFAULT_LIMIT;

  const queryVector = await embedText(query);
  const db = getDb();

  // pgvector's `<=>` is cosine *distance*; embeddings are unit-normalized
  // (see embeddings.ts), so similarity = 1 - distance.
  const similarity = sql<number>`1 - (${verses.embedding} <=> ${JSON.stringify(queryVector)}::vector)`;

  return db
    .select({
      translation: verses.translation,
      book: verses.book,
      chapter: verses.chapter,
      verse: verses.verse,
      text: verses.text,
      similarity,
    })
    .from(verses)
    .where(eq(verses.translation, translation))
    .orderBy(desc(similarity))
    .limit(limit);
}
