import type { OutlineVerseRef } from "./types";

export function isInOutline(
  verse: { book: string; chapter: number; verse: number },
  outline: readonly OutlineVerseRef[],
): boolean {
  return outline.some(
    (o) => o.book === verse.book && o.chapter === verse.chapter && o.verse === verse.verse,
  );
}

/**
 * A semantic candidate's final routing confidence: its raw cosine
 * similarity, boosted if it's in the session's Prep outline. Clamped to
 * [0, 1] since a boost could otherwise push a near-1 similarity over 1.
 */
export function boostedConfidence(
  rawSimilarity: number,
  inOutline: boolean,
  outlineBoost: number,
): number {
  const boosted = inOutline ? rawSimilarity + outlineBoost : rawSimilarity;
  return Math.min(1, Math.max(0, boosted));
}
