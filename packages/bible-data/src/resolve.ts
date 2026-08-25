import { and, asc, desc, eq, gt, gte, lt, lte } from "drizzle-orm";
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

const VERSE_COLUMNS = {
  translation: verses.translation,
  book: verses.book,
  chapter: verses.chapter,
  verse: verses.verse,
  text: verses.text,
};

/**
 * Steps one verse forward or backward from a given book/chapter/verse,
 * rolling into the next/previous chapter at a chapter boundary (but not
 * across a book boundary — reaching the start/end of a book's verse data
 * returns null). Used by the Control console's verse-navigation controls so
 * an operator can step through a passage one verse at a time regardless of
 * how many verses the original match/reference covered.
 */
export async function getAdjacentVerse(
  current: { book: string; chapter: number; verse: number },
  direction: "next" | "prev",
  translation: string = DEFAULT_TRANSLATION,
): Promise<ResolvedVerse | null> {
  const db = getDb();

  if (direction === "next") {
    const [withinChapter] = await db
      .select(VERSE_COLUMNS)
      .from(verses)
      .where(
        and(
          eq(verses.translation, translation),
          eq(verses.book, current.book),
          eq(verses.chapter, current.chapter),
          gt(verses.verse, current.verse),
        ),
      )
      .orderBy(asc(verses.verse))
      .limit(1);
    if (withinChapter) return withinChapter;

    const [nextChapter] = await db
      .select(VERSE_COLUMNS)
      .from(verses)
      .where(
        and(
          eq(verses.translation, translation),
          eq(verses.book, current.book),
          gt(verses.chapter, current.chapter),
        ),
      )
      .orderBy(asc(verses.chapter), asc(verses.verse))
      .limit(1);
    return nextChapter ?? null;
  }

  const [withinChapter] = await db
    .select(VERSE_COLUMNS)
    .from(verses)
    .where(
      and(
        eq(verses.translation, translation),
        eq(verses.book, current.book),
        eq(verses.chapter, current.chapter),
        lt(verses.verse, current.verse),
      ),
    )
    .orderBy(desc(verses.verse))
    .limit(1);
  if (withinChapter) return withinChapter;

  const [prevChapter] = await db
    .select(VERSE_COLUMNS)
    .from(verses)
    .where(
      and(
        eq(verses.translation, translation),
        eq(verses.book, current.book),
        lt(verses.chapter, current.chapter),
      ),
    )
    .orderBy(desc(verses.chapter), desc(verses.verse))
    .limit(1);
  return prevChapter ?? null;
}

/**
 * Distinct chapter numbers a book actually has in this translation — backs
 * the Control console's Bible browse picker (book → chapter step). Every
 * ingested translation covers the same canonical 66 books, so this is really
 * "how many chapters does this book have," but scoped by translation anyway
 * in case a future translation is ever ingested only partially.
 */
export async function getChaptersForBook(translation: string, book: string): Promise<number[]> {
  const db = getDb();
  const rows = await db
    .selectDistinct({ chapter: verses.chapter })
    .from(verses)
    .where(and(eq(verses.translation, translation), eq(verses.book, book)))
    .orderBy(asc(verses.chapter));
  return rows.map((r) => r.chapter);
}

/** Verse → text for one chapter — the browse picker's final (chapter → verse) step. */
export async function getVersesForChapter(
  translation: string,
  book: string,
  chapter: number,
): Promise<{ verse: number; text: string }[]> {
  const db = getDb();
  return db
    .select({ verse: verses.verse, text: verses.text })
    .from(verses)
    .where(and(eq(verses.translation, translation), eq(verses.book, book), eq(verses.chapter, chapter)))
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
