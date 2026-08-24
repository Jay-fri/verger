import { BOOKS } from "../books";

// bolls.life serves several public-domain translations under their own
// short codes — WEB, KJV, ASV, YLT are the ones this app actually ingests
// (see run-ingest.ts and the README for exactly which, and why those four).
// A licensed modern translation (NIV, ESV, NASB, NLT, CSB, etc.) needs its
// own rights check with the publisher before production use — bolls.life
// happens to serve those too (for its own app), but that's not a
// redistribution license for us. See packages/shared-types' BIBLE_TRANSLATIONS
// for the full flag.
//
// Every translation's book list uses bookid 1-66 for the standard 66-book
// Protestant canon, in the exact same order as src/books.ts (verified by
// inspection at integration time, and re-checked per translation below since
// bolls.life doesn't guarantee it) — book N in BOOKS corresponds to
// bollsBookId N+1's position, i.e. array index + 1.
const BASE_URL = "https://bolls.life";

type BollsBook = { bookid: number; name: string; chapters: number };
type BollsVerse = { pk: number; verse: number; text: string };

export type FetchedVerse = {
  translation: string;
  book: string;
  chapter: number;
  verse: number;
  text: string;
};

function cleanText(raw: string): string {
  return raw
    // <S>1063</S>-style Strong's-number annotations and <sup>...</sup>
    // translator's footnotes must be dropped *with* their inner content,
    // not just unwrapped — real bug found ingesting KJV/ASV (both served by
    // bolls.life "with Strong's Numbers" by default, with no
    // without-numbers variant available under those codes): naively
    // stripping just the tags left the numbers behind as literal text
    // directly appended to the preceding word with no space, e.g. "For1063
    // God2316 so3779 loved25 the world2889" — every single word in the
    // verse, not an edge case. Order matters: this pass must run before the
    // generic tag-strip below, or "<S>1063</S>" would already have lost its
    // tag delimiters and be indistinguishable from ordinary text.
    .replace(/<S>[^<]*<\/S>/g, "")
    .replace(/<sup>[^<]*<\/sup>/g, "")
    .replace(/<[^>]+>/g, "") // strip remaining formatting markup, e.g. <b>A Psalm of David.</b> — keeps the inner text, only WEB uses this
    .replace(/\s+/g, " ")
    .trim();
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`GET ${url} -> HTTP ${res.status}`);
  }
  return (await res.json()) as T;
}

export async function fetchBookList(translationCode: string): Promise<BollsBook[]> {
  const books = await fetchJson<BollsBook[]>(`${BASE_URL}/get-books/${translationCode}/`);
  return books.filter((b) => b.bookid >= 1 && b.bookid <= 66).sort((a, b) => a.bookid - b.bookid);
}

async function fetchChapter(
  translationCode: string,
  bookCode: string,
  bollsBookId: number,
  chapter: number,
): Promise<FetchedVerse[]> {
  const verses = await fetchJson<BollsVerse[]>(
    `${BASE_URL}/get-text/${translationCode}/${bollsBookId}/${chapter}/`,
  );
  return verses.map((v) => ({
    translation: translationCode,
    book: bookCode,
    chapter,
    verse: v.verse,
    text: cleanText(v.text),
  }));
}

// Fetches one whole translation (identified by its bolls.life short code —
// see the module comment above for which ones this app actually uses),
// `concurrency` chapters at a time, calling `onChapter` as each chapter
// completes so callers can insert incrementally rather than holding ~31k
// verses in memory at once.
export async function fetchTranslation(
  translationCode: string,
  onChapter: (verses: FetchedVerse[], progress: { done: number; total: number }) => Promise<void>,
  concurrency = 8,
): Promise<void> {
  const bollsBooks = await fetchBookList(translationCode);
  if (bollsBooks.length !== 66) {
    throw new Error(`Expected 66 canonical books from bolls.life for ${translationCode}, got ${bollsBooks.length}`);
  }

  // Strips a leading ordinal ("1 ", "2 ") and a trailing "s" before
  // comparing — real finding ingesting YLT: bolls.life names that book
  // "Psalm" (singular) where every other translation here calls it
  // "Psalms", a harmless per-translation naming quirk, not an actual
  // reordering. bookid 1-66 in ascending order is the real invariant this
  // check protects; the name is just a human-readable sanity cross-check on
  // top of it, so it can afford to be this lenient without weakening what
  // it's actually guarding against (bolls.life silently reordering books).
  function normalizeBookName(name: string): string {
    return name.replace(/^\d /, "").toLowerCase().replace(/s$/, "");
  }

  type Job = { bookCode: string; bollsBookId: number; chapter: number };
  const jobs: Job[] = [];
  BOOKS.forEach((book, i) => {
    const bollsBook = bollsBooks[i];
    if (normalizeBookName(bollsBook.name) !== normalizeBookName(book.name)) {
      throw new Error(
        `Book order mismatch at index ${i} for ${translationCode}: expected "${book.name}", bolls.life has "${bollsBook.name}"`,
      );
    }
    for (let chapter = 1; chapter <= bollsBook.chapters; chapter++) {
      jobs.push({ bookCode: book.code, bollsBookId: bollsBook.bookid, chapter });
    }
  });

  let done = 0;
  let cursor = 0;

  async function worker() {
    while (cursor < jobs.length) {
      const job = jobs[cursor++];
      const verses = await fetchChapter(translationCode, job.bookCode, job.bollsBookId, job.chapter);
      await onChapter(verses, { done: ++done, total: jobs.length });
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => worker()));
}
