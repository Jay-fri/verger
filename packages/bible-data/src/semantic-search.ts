import { and, desc, eq, sql } from "drizzle-orm";
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

export type SemanticSearchScope = { book: string; chapter?: number };

/**
 * The DB half of semanticSearch, taking an already-computed embedding
 * instead of a query string — split out from semanticSearch() specifically
 * so a caller that wants isolated timing (see detectChunkEvents' per-stage
 * profiling) can measure the embedding call and the DB query separately,
 * rather than only ever seeing their combined cost.
 */
export async function searchByEmbedding(
  queryVector: number[],
  opts?: { translation?: string; limit?: number; scope?: SemanticSearchScope },
): Promise<SemanticMatch[]> {
  const translation = opts?.translation ?? DEFAULT_TRANSLATION;
  const limit = opts?.limit ?? DEFAULT_LIMIT;
  const db = getDb();

  // pgvector's `<=>` is cosine *distance*; embeddings are unit-normalized
  // (see embeddings.ts), so similarity = 1 - distance.
  const similarity = sql<number>`1 - (${verses.embedding} <=> ${JSON.stringify(queryVector)}::vector)`;

  const conditions = [eq(verses.translation, translation)];
  if (opts?.scope) {
    conditions.push(eq(verses.book, opts.scope.book));
    if (opts.scope.chapter !== undefined) {
      conditions.push(eq(verses.chapter, opts.scope.chapter));
    }
  }

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
    .where(and(...conditions))
    .orderBy(desc(similarity))
    .limit(limit);
}

export async function semanticSearch(
  query: string,
  opts?: {
    translation?: string;
    limit?: number;
    /**
     * Restricts the search to one book (optionally one chapter within it)
     * instead of the whole ~31,000-verse table — for when a partial
     * reference ("2 Corinthians 6", or just "Romans") was already heard
     * alongside a paraphrase. Doesn't change any individual verse's
     * similarity score (that's fixed by the embeddings alone), but keeps
     * irrelevant higher-scoring verses from elsewhere in the Bible from
     * crowding out the right one within the top `limit` results — and, in
     * practice, is also dramatically cheaper: scoped searches use the
     * plain book/chapter btree index and sort a handful of rows, while an
     * unscoped search has to fall back to the approximate HNSW vector index
     * over the whole table.
     */
    scope?: SemanticSearchScope;
  },
): Promise<SemanticMatch[]> {
  const queryVector = await embedText(query);
  return searchByEmbedding(queryVector, opts);
}
