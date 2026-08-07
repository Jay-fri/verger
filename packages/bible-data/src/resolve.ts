import { and, asc, eq, gte, lte } from "drizzle-orm";
import { getDb } from "./db";
import { verses } from "./db/schema";
import { parseReference, type ParsedReference } from "./reference-parser";
import { semanticSearch, type SemanticMatch, DEFAULT_TRANSLATION } from "./semantic-search";

export type ResolvedVerse = {
  translation: string;
  book: string;
  chapter: number;
  verse: number;
  text: string;
};

export type ResolveResult =
  | { method: "exact"; reference: ParsedReference; verses: ResolvedVerse[] }
  | { method: "semantic"; matches: SemanticMatch[] }
  | { method: "none" };

/**
 * Looks up the verse(s) a parsed reference points to. Exported (not just
 * used internally by resolveScripture) because callers that find their own
 * references — e.g. the detection engine's findReference(), which locates a
 * reference embedded in a longer sentence rather than requiring the whole
 * input to be one — need this same lookup without resolveScripture's
 * bundled semantic-search fallback.
 */
export async function getVersesForReference(
  ref: ParsedReference,
  translation: string = DEFAULT_TRANSLATION,
): Promise<ResolvedVerse[]> {
  const db = getDb();
  const conditions = [
    eq(verses.translation, translation),
    eq(verses.book, ref.book),
    eq(verses.chapter, ref.chapter),
  ];

  if (ref.verseStart !== undefined) {
    conditions.push(gte(verses.verse, ref.verseStart));
    conditions.push(lte(verses.verse, ref.verseEnd ?? ref.verseStart));
  }

  return db
    .select({
      translation: verses.translation,
      book: verses.book,
      chapter: verses.chapter,
      verse: verses.verse,
      text: verses.text,
    })
    .from(verses)
    .where(and(...conditions))
    .orderBy(asc(verses.verse));
}

/**
 * The single entry point the detection engine will call: tries exact-
 * reference parsing first ("John 3:16"), and only falls back to embedding-
 * based semantic search over the full input text if that path finds nothing
 * — either because the input didn't parse as a reference at all, or it
 * parsed but matched zero rows (e.g. a chapter/verse that doesn't exist).
 */
export async function resolveScripture(
  input: string,
  opts?: { translation?: string; semanticLimit?: number },
): Promise<ResolveResult> {
  const translation = opts?.translation ?? DEFAULT_TRANSLATION;

  const parsed = parseReference(input);
  if (parsed) {
    const exactVerses = await getVersesForReference(parsed, translation);
    if (exactVerses.length > 0) {
      return { method: "exact", reference: parsed, verses: exactVerses };
    }
  }

  const matches = await semanticSearch(input, { translation, limit: opts?.semanticLimit });
  if (matches.length === 0) {
    return { method: "none" };
  }
  return { method: "semantic", matches };
}
