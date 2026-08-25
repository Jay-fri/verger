"use server";

import {
  getAdjacentVerse,
  getBook,
  getChaptersForBook,
  getVersesForChapter,
  getVersesForReference,
  resolveScripture,
  BOOKS,
  DEFAULT_TRANSLATION,
  type BookMeta,
} from "@verger/bible-data";
import { requireActiveMembership } from "@/lib/auth/membership";

export type VerseSearchResult = {
  translation: string;
  book: string;
  chapter: number;
  verse: number;
  text: string;
  label: string;
};

function label(book: string, chapter: number, verse: number): string {
  return `${getBook(book)?.name ?? book} ${chapter}:${verse}`;
}

/**
 * Shared search used by both the Prep builder ("add key verses") and the
 * Control console's manual fallback search — read-only, so any active
 * church member can use it regardless of role.
 *
 * Matching (exact reference or semantic) always runs against
 * DEFAULT_TRANSLATION inside resolveScripture — WEB is the only translation
 * with embeddings, so semantic search has no other option, and exact-match
 * stays on the same one for consistency. `displayTranslation` is a
 * completely separate concern: once a canonical reference is found, this
 * re-fetches its text in whatever translation the caller actually wants
 * shown (the Control console's current session translation, or a church's
 * default in Prep), the same decoupled-lookup-by-reference pattern
 * detection.ts uses. Skipped entirely when it matches the matching
 * translation already, the common case.
 */
export async function searchVersesAction(
  query: string,
  displayTranslation: string = DEFAULT_TRANSLATION,
): Promise<VerseSearchResult[]> {
  await requireActiveMembership();

  const trimmed = query.trim();
  if (!trimmed) return [];

  const result = await resolveScripture(trimmed, { semanticLimit: 8 });

  const rawMatches =
    result.method === "exact"
      ? result.verses
      : result.method === "semantic"
        ? result.matches.map((m) => ({ translation: m.translation, book: m.book, chapter: m.chapter, verse: m.verse, text: m.text }))
        : [];

  if (rawMatches.length === 0) return [];
  if (displayTranslation === DEFAULT_TRANSLATION) {
    return rawMatches.map((v) => ({ ...v, label: label(v.book, v.chapter, v.verse) }));
  }

  return Promise.all(
    rawMatches.map(async (v) => {
      const [row] = await getVersesForReference(
        { book: v.book, chapter: v.chapter, verseStart: v.verse, verseEnd: v.verse },
        displayTranslation,
      );
      const resolved = row ?? v;
      return { ...resolved, label: label(resolved.book, resolved.chapter, resolved.verse) };
    }),
  );
}

/**
 * Re-fetches one already-live verse's text in a different translation, by
 * its canonical reference alone — no detection, no search, just the same
 * plain lookup getVersesForReference always does. Backs the Control
 * console's translation switcher: switching translation while a verse is
 * live re-pushes it through this, never through detection or search.
 */
export async function getVerseInTranslationAction(
  reference: { book: string; chapter: number; verse: number },
  translation: string,
): Promise<VerseSearchResult | null> {
  await requireActiveMembership();

  const [row] = await getVersesForReference(
    { book: reference.book, chapter: reference.chapter, verseStart: reference.verse, verseEnd: reference.verse },
    translation,
  );
  if (!row) return null;
  return { ...row, label: label(row.book, row.chapter, row.verse) };
}

/**
 * Backs the Control console's Previous/Next verse controls — steps one
 * verse forward or backward from wherever is currently live, regardless of
 * how the current verse got there (cue, AI detection, or search).
 */
export async function getAdjacentVerseAction(
  current: { translation: string; book: string; chapter: number; verse: number },
  direction: "next" | "prev",
): Promise<VerseSearchResult | null> {
  await requireActiveMembership();

  const result = await getAdjacentVerse(current, direction, current.translation);
  if (!result) return null;
  return { ...result, label: label(result.book, result.chapter, result.verse) };
}

/** Static book list (OT/NT, canonical order) — the browse picker's first step. No DB round trip. */
export async function listBooksAction(): Promise<BookMeta[]> {
  await requireActiveMembership();
  return BOOKS;
}

/** Chapter numbers a book has in the given translation — the browse picker's second step. */
export async function listChaptersAction(translation: string, book: string): Promise<number[]> {
  await requireActiveMembership();
  return getChaptersForBook(translation, book);
}

/** Verse text for one chapter — the browse picker's third step, and what actually pushes live on selection. */
export async function listVersesAction(
  translation: string,
  book: string,
  chapter: number,
): Promise<VerseSearchResult[]> {
  await requireActiveMembership();
  const rows = await getVersesForChapter(translation, book, chapter);
  return rows.map((r) => ({ translation, book, chapter, verse: r.verse, text: r.text, label: label(book, chapter, r.verse) }));
}
