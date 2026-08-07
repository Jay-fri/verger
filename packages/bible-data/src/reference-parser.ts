import { BOOKS } from "./books";

export type ParsedReference = {
  /** Canonical book code, e.g. "JHN". */
  book: string;
  chapter: number;
  /** Absent when the reference names a whole chapter ("Romans 8"). */
  verseStart?: number;
  verseEnd?: number;
};

function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/\./g, "")
    .replace(/\s+/g, " ")
    .trim();
}

type AliasEntry = { normalized: string; code: string };

const ALIAS_ENTRIES: AliasEntry[] = BOOKS.flatMap((book) =>
  [book.name, ...book.aliases].map((name) => ({ normalized: normalize(name), code: book.code })),
)
  // Longest alias first, so "1 corinthians" is tried before a shorter alias
  // that happens to be one of its prefixes could steal the match.
  .sort((a, b) => b.normalized.length - a.normalized.length);

// Matches the part after the book name: "16", "3:16", "3:16-18". The whole
// remainder must match (anchored) — this is what stops a paraphrase like
// "Job 23 is my favorite psalm" from being misread as a chapter reference.
const TAIL_PATTERN = /^(\d{1,3})(?:\s*:\s*(\d{1,3})(?:\s*[-–—]\s*(\d{1,3}))?)?$/;

/**
 * Parses a literal scripture reference ("John 3:16", "Jn 3:16-18", "First
 * Corinthians 13"). Purely syntactic — it resolves book-name variants to a
 * canonical code and extracts chapter/verse numbers, but does not check
 * whether that chapter/verse actually exists. That's the database's job
 * (see resolve.ts): a structurally valid but out-of-range reference like
 * "Genesis 99:1" parses fine here and simply matches zero rows downstream.
 *
 * Returns null for anything that isn't shaped like a reference at all,
 * including a bare book name with no chapter ("John").
 *
 * Known limitation: single-chapter books (Jude, Philemon, 2 John, 3 John)
 * are parsed as chapter references ("Jude 3" -> chapter 3, which doesn't
 * exist) rather than the conventional verse-only shorthand ("Jude 3" ->
 * chapter 1, verse 3). Not handled yet — would need per-book chapter counts.
 */
export function parseReference(input: string): ParsedReference | null {
  const normalized = normalize(input);
  if (!normalized) return null;

  for (const entry of ALIAS_ENTRIES) {
    if (normalized === entry.normalized) continue; // bare book name, no chapter
    if (!normalized.startsWith(entry.normalized + " ")) continue;

    const rest = normalized.slice(entry.normalized.length).trim();
    const match = TAIL_PATTERN.exec(rest);
    if (!match) continue;

    const chapter = Number(match[1]);
    if (chapter < 1) continue;

    const verseStart = match[2] ? Number(match[2]) : undefined;
    const verseEnd = match[3] ? Number(match[3]) : verseStart;
    if (verseStart !== undefined && verseStart < 1) continue;
    if (verseEnd !== undefined && verseEnd < verseStart!) continue;

    return { book: entry.code, chapter, verseStart, verseEnd };
  }

  return null;
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// One compiled regex per alias, built lazily on first use and cached —
// findReference() runs one of these per alias per call, so avoiding
// recompilation matters once it's called per transcript chunk.
const EMBEDDED_PATTERNS = new Map<string, RegExp>();

function getEmbeddedPattern(entry: AliasEntry): RegExp {
  let pattern = EMBEDDED_PATTERNS.get(entry.normalized);
  if (!pattern) {
    pattern = new RegExp(
      `\\b${escapeRegExp(entry.normalized)}\\b\\s*(?:chapter\\s+)?(\\d{1,3})(?:\\s*[:,]\\s*(?:verse\\s+)?(\\d{1,3})(?:\\s*[-–—]\\s*(\\d{1,3}))?)?`,
    );
    EMBEDDED_PATTERNS.set(entry.normalized, pattern);
  }
  return pattern;
}

/**
 * Like parseReference(), but finds a reference *anywhere* in a longer
 * string instead of requiring the whole string to be one — for real speech,
 * where a reference is usually embedded in a sentence ("Turn with me to
 * John chapter 3, verse 16") rather than typed bare ("John 3:16"). Also
 * tolerates "chapter"/"verse" filler words and comma separators, which
 * spoken/transcribed references commonly include.
 *
 * When multiple candidates match, prefers the leftmost occurrence in the
 * text, then the longest alias on a tie (same "1 corinthians" before "1"
 * precedence as parseReference).
 */
export function findReference(input: string): ParsedReference | null {
  const normalized = normalize(input);
  if (!normalized) return null;

  let best: { index: number; length: number; ref: ParsedReference } | null = null;

  for (const entry of ALIAS_ENTRIES) {
    const match = getEmbeddedPattern(entry).exec(normalized);
    if (!match) continue;

    const chapter = Number(match[1]);
    if (chapter < 1) continue;

    const verseStart = match[2] ? Number(match[2]) : undefined;
    const verseEnd = match[3] ? Number(match[3]) : verseStart;
    if (verseStart !== undefined && verseStart < 1) continue;
    if (verseEnd !== undefined && verseEnd < verseStart!) continue;

    const isBetter =
      !best ||
      match.index < best.index ||
      (match.index === best.index && match[0].length > best.length);
    if (isBetter) {
      best = {
        index: match.index,
        length: match[0].length,
        ref: { book: entry.code, chapter, verseStart, verseEnd },
      };
    }
  }

  return best?.ref ?? null;
}
