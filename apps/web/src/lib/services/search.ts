"use server";

import { getBook, resolveScripture } from "@verger/bible-data";
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
 */
export async function searchVersesAction(query: string): Promise<VerseSearchResult[]> {
  await requireActiveMembership();

  const trimmed = query.trim();
  if (!trimmed) return [];

  const result = await resolveScripture(trimmed, { semanticLimit: 8 });

  if (result.method === "exact") {
    return result.verses.map((v) => ({ ...v, label: label(v.book, v.chapter, v.verse) }));
  }
  if (result.method === "semantic") {
    return result.matches.map((m) => ({
      translation: m.translation,
      book: m.book,
      chapter: m.chapter,
      verse: m.verse,
      text: m.text,
      label: label(m.book, m.chapter, m.verse),
    }));
  }
  return [];
}
