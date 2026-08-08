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

// ---------------------------------------------------------------------------
// Spoken-number handling
// ---------------------------------------------------------------------------
// Real transcripts from a live sermon come through as spoken words, not
// digits — AssemblyAI doesn't format partial transcripts at all, and even
// formatted finals aren't guaranteed to render every number as a digit. So
// the spoken-reference scanner below normalizes number *words* ("chapter
// three, verse sixteen") to digits before it ever looks for a reference —
// parseReference() (the typed/written-citation path used by the manual
// search box) is deliberately left untouched by this; it keeps its original
// digits-only behavior.

const UNITS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9,
};
const TEENS: Record<string, number> = {
  ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15,
  sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19,
};
const TENS: Record<string, number> = {
  twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90,
};

/**
 * Consumes exactly one grammatically-valid English cardinal number starting
 * at `words[start]` (e.g. "twenty eight" -> 28, "one hundred and nineteen"
 * -> 119) and reports how many words it used. Deliberately grammar-bounded
 * rather than greedily summing every number word in a row — "eight twenty
 * eight" (as in "Romans eight twenty-eight") must read as two separate
 * numbers, 8 and 28, not one nonsense sum.
 */
function readNumberRun(words: string[], start: number): { value: number; length: number } | null {
  let i = start;
  let value = 0;
  let matched = false;

  if (words[i] in UNITS && words[i + 1] === "hundred") {
    value += UNITS[words[i]] * 100;
    i += 2;
    matched = true;
    if (words[i] === "and") i++;
  } else if (words[i] === "hundred") {
    value += 100;
    i += 1;
    matched = true;
    if (words[i] === "and") i++;
  }

  if (words[i] in TEENS) {
    value += TEENS[words[i]];
    i += 1;
    matched = true;
  } else if (words[i] in TENS) {
    value += TENS[words[i]];
    i += 1;
    matched = true;
    if (words[i] in UNITS) {
      value += UNITS[words[i]];
      i += 1;
    }
  } else if (words[i] in UNITS) {
    value += UNITS[words[i]];
    i += 1;
    matched = true;
  }

  return matched ? { value, length: i - start } : null;
}

/**
 * Replaces every spoken number word (or run of them, per English cardinal
 * number grammar) with its digit equivalent, leaving everything else
 * untouched. Exported mainly so it can be tested directly.
 */
export function normalizeSpokenNumbers(text: string): string {
  const words = text.split(/\s+/).filter(Boolean);
  const out: string[] = [];
  let i = 0;

  while (i < words.length) {
    const run = readNumberRun(words, i);
    if (run) {
      out.push(String(run.value));
      i += run.length;
    } else {
      out.push(words[i]);
      i += 1;
    }
  }

  return out.join(" ");
}

/**
 * Preprocessing specific to the spoken-reference scanner (findAllReferences
 * below): spells out colons/commas/digit-adjacent dashes as spaces/words so
 * "John 3:16" and "chapter 3, verse 16" tokenize the same way a genuinely
 * spoken "chapter three verse sixteen" would, then normalizes number words.
 * Built on top of normalize() (unchanged) rather than replacing it, so
 * parseReference's digits-only, colon/dash-sensitive grammar is unaffected.
 */
function tokenizeForSpokenScan(text: string): string[] {
  const spaced = normalize(text)
    .replace(/:/g, " ")
    .replace(/,/g, " ")
    .replace(/(\d)\s*[-–—]\s*(\d)/g, "$1 through $2")
    .replace(/\s+/g, " ")
    .trim();
  return normalizeSpokenNumbers(spaced).split(" ").filter(Boolean);
}

// ---------------------------------------------------------------------------
// Spoken-reference scanner
// ---------------------------------------------------------------------------

// chapter is nullable so a book-only mention ("as Paul writes to the
// Romans...", no chapter ever stated) can still be carried forward — used
// to scope semantic search to a book instead of a chapter when that's all
// that's known. See detectChunkEvents in @verger/detection-engine.
export type ReferenceContext = { book: string; chapter: number | null };

type AliasTokens = { tokens: string[]; code: string };

// Single-token names that collide with extremely ordinary English words —
// "Is" (Isaiah), "Am" (Amos), "Act" (Acts). Real finding from testing:
// "...as an act of worship" mid-sentence matched "Act" as a fresh book
// mention, silently overwriting whatever book/chapter had actually just
// been established. Written citations abbreviate books this tersely ("Is
// 40:1"); spoken sermons essentially never do — nobody says "turn to Am
// chapter five" out loud — so these are excluded from the spoken scanner
// only. parseReference (the typed manual-search box, where someone might
// deliberately type "Is 40:1") is untouched; the books' full names and
// their other, less collision-prone abbreviations ("Isa", "Ac") still work
// here too.
//
// "Job" is the same category of collision, but with no less-common
// alternative name to fall back on the way Isaiah/Amos/Acts have — real
// finding from a live piloting session: "...my job was uncertain..." got
// read as a fresh mention of the book of Job, scoping semantic search to
// the wrong book for the rest of that utterance. The tradeoff is real (a
// pastor saying "the book of Job" by name won't register via the spoken
// scanner — same limitation as "Is 40:1" above), but "job" the noun is
// common enough in ordinary sermon speech that the false-positive rate
// firmly outweighs the rare deliberate mention.
const SPOKEN_SCAN_EXCLUDED_ALIASES = new Set(["is", "am", "act", "job"]);

// Derived from ALIAS_ENTRIES (already sorted longest-first) by splitting
// each alias into its own words, so a multi-word alias like "song of
// solomon" or "1 corinthians" can be matched against a run of tokens.
const ALIAS_TOKEN_ENTRIES: AliasTokens[] = ALIAS_ENTRIES.filter(
  (entry) => !SPOKEN_SCAN_EXCLUDED_ALIASES.has(entry.normalized),
).map((entry) => ({
  tokens: entry.normalized.split(" "),
  code: entry.code,
}));

function isDigits(token: string | undefined): token is string {
  return token !== undefined && /^\d{1,3}$/.test(token);
}

// "chapter number 5", "verse number 17" — a formal/dictation-style filler
// word some speech gets transcribed with, between "chapter"/"verse" and the
// digit, instead of the terser "chapter 5" the scanner otherwise expects.
// Real finding from a live piloting session: "Ephesians chapter number 5,
// verse number 17" produced zero matches, because neither "chapter" nor
// "verse" were immediately followed by a digit — the whole reference was
// silently invisible to the scanner despite being unambiguous to a human
// reader. Returns the index to check for the digit at, skipping one
// "number" token if present.
function skipFillerNumber(tokens: string[], index: number): number {
  return tokens[index] === "number" ? index + 1 : index;
}

function matchBookAliasAt(tokens: string[], index: number): { code: string; length: number } | null {
  for (const entry of ALIAS_TOKEN_ENTRIES) {
    const n = entry.tokens.length;
    if (index + n > tokens.length) continue;

    let matches = true;
    for (let k = 0; k < n; k++) {
      if (tokens[index + k] !== entry.tokens[k]) {
        matches = false;
        break;
      }
    }
    if (matches) return { code: entry.code, length: n };
  }
  return null;
}

export type ScannedReference = ParsedReference & {
  /**
   * True when this reference came from a bare chapter mention with no verse
   * ever stated for it ("Romans chapter 8" and nothing else) — verseStart
   * is absent for these. Exists so a caller on the live path can route
   * these more conservatively (require operator confirmation) instead of
   * auto-displaying a guessed verse 1 the instant a chapter is named, which
   * is the wrong call when — the common case — a specific verse is about
   * to be stated next. See detectChunkEvents in @verger/detection-engine.
   */
  isWholeChapter: boolean;
};

/**
 * Like findReference(), but returns *every* reference mentioned in a piece
 * of transcript, built to handle how references actually get said out loud
 * rather than how they get typed:
 *
 *  - number *words* as well as digits ("chapter three, verse sixteen")
 *  - "verse Y of chapter X" (verse-first ordering)
 *  - a chapter stated once, with its verse arriving several words later in
 *    the same clause ("the book of Romans, chapter eight, and let's look
 *    at verse twenty eight")
 *  - a bare "verse Y" with no book/chapter restated at all, resolved
 *    against whichever book/chapter was most recently established —
 *    either earlier in this same text, or via the optional `context` param
 *    (for a verse mentioned a few seconds after its chapter, in a
 *    *separate* transcript chunk — see use-live-transcription.ts)
 *
 * A chapter mentioned with no verse at all ("Romans chapter 8" and nothing
 * else) still produces a reference (isWholeChapter: true) — same as
 * before — but only once the scan is sure no verse is coming for it (the
 * end of the text, a new chapter stated for the same book, or a new book
 * entirely), so it doesn't preempt a verse number that's still a few words
 * away in the same sentence.
 *
 * Returns both the references found and the updated book/chapter context
 * (or the context passed in, unchanged, if this chunk mentioned neither). The
 * context's `chapter` is null when only a book was mentioned with no chapter
 * ever stated for it ("as Paul writes to the Romans...") — still useful for
 * scoping a semantic search to that book, just not specific enough to name a
 * chapter's opening verse the way a chapter-only reference can.
 */
export function findAllReferences(
  input: string,
  context?: ReferenceContext,
): { refs: ScannedReference[]; context: ReferenceContext | null } {
  const tokens = tokenizeForSpokenScan(input);
  if (tokens.length === 0) return { refs: [], context: context ?? null };

  const refs: ScannedReference[] = [];
  let book: string | null = context?.book ?? null;
  let chapter: number | null = context?.chapter ?? null;
  let justSawBookAt = -1;
  // True right after this text states a new chapter that hasn't yet been
  // paired with a verse — cleared the moment a verse is attached, so we
  // know whether to flush a whole-chapter reference when that chapter
  // statement gets superseded (or the scan ends).
  let chapterPending = false;

  function flushPendingWholeChapter() {
    if (chapterPending && book !== null && chapter !== null) {
      refs.push({ book, chapter, isWholeChapter: true });
    }
    chapterPending = false;
  }

  let i = 0;
  while (i < tokens.length) {
    const bookMatch = matchBookAliasAt(tokens, i);
    if (bookMatch) {
      flushPendingWholeChapter();
      book = bookMatch.code;
      chapter = null;
      i += bookMatch.length;
      justSawBookAt = i;
      continue;
    }

    const isChapterWord = tokens[i] === "chapter";
    const chapterDigitIdx = isChapterWord ? skipFillerNumber(tokens, i + 1) : -1;
    const isTerseBookNumber = i === justSawBookAt && isDigits(tokens[i]);
    if (book !== null && ((isChapterWord && isDigits(tokens[chapterDigitIdx])) || isTerseBookNumber)) {
      flushPendingWholeChapter();
      if (isChapterWord) {
        chapter = Number(tokens[chapterDigitIdx]);
        i = chapterDigitIdx + 1;
      } else {
        chapter = Number(tokens[i]);
        i += 1;
      }
      chapterPending = true;
      justSawBookAt = -1;

      // Eager same-breath lookahead: a bare number right here (no "verse"
      // word at all — "chapter 3:16" once the colon becomes a space, or a
      // fully terse "Romans eight twenty-eight") is the verse.
      if (isDigits(tokens[i])) {
        const verseStart = Number(tokens[i]);
        i += 1;
        let verseEnd = verseStart;
        if ((tokens[i] === "through" || tokens[i] === "to") && isDigits(tokens[i + 1])) {
          verseEnd = Number(tokens[i + 1]);
          i += 2;
        }
        refs.push({ book, chapter, verseStart, verseEnd, isWholeChapter: false });
        chapterPending = false;
      }
      continue;
    }

    const isVerseWord = tokens[i] === "verse" || tokens[i] === "verses";
    const verseDigitIdx = isVerseWord ? skipFillerNumber(tokens, i + 1) : -1;
    if (isVerseWord && isDigits(tokens[verseDigitIdx])) {
      const verseStart = Number(tokens[verseDigitIdx]);
      let j = verseDigitIdx + 1;
      let effectiveChapter = chapter;

      // "verse 28 of chapter 8" (or "...of chapter number 8") — verse-first
      // ordering.
      if (tokens[j] === "of" && tokens[j + 1] === "chapter") {
        const ofChapterDigitIdx = skipFillerNumber(tokens, j + 2);
        if (isDigits(tokens[ofChapterDigitIdx])) {
          effectiveChapter = Number(tokens[ofChapterDigitIdx]);
          chapter = effectiveChapter;
          j = ofChapterDigitIdx + 1;
        }
      }

      let verseEnd = verseStart;
      if ((tokens[j] === "through" || tokens[j] === "to") && isDigits(tokens[j + 1])) {
        verseEnd = Number(tokens[j + 1]);
        j += 2;
      }

      if (book !== null && effectiveChapter !== null) {
        refs.push({ book, chapter: effectiveChapter, verseStart, verseEnd, isWholeChapter: false });
        chapterPending = false;
      }
      i = j;
      justSawBookAt = -1;
      continue;
    }

    justSawBookAt = -1;
    i += 1;
  }

  flushPendingWholeChapter();

  // A book mention alone (chapter never stated for it) is still worth
  // carrying forward — book-only scoping for semantic search is coarser
  // than chapter scoping, but still a fraction of the full Bible.
  const updatedContext: ReferenceContext | null = book !== null ? { book, chapter } : (context ?? null);
  return { refs, context: updatedContext };
}

/**
 * Single-match convenience wrapper over findAllReferences, for callers that
 * only want the first (leftmost) reference in a piece of text.
 */
export function findReference(input: string): ParsedReference | null {
  return findAllReferences(input).refs[0] ?? null;
}
