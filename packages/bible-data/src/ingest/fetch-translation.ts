import { BOOKS } from "../books";

// bolls.life serves the World English Bible (WEB) — public domain, so it
// sidesteps licensing questions during development. A licensed modern
// translation (NIV, ESV, etc.) needs its own rights check with the
// publisher before production use — see the README.
//
// Its book list uses bookid 1-66 for the standard 66-book Protestant canon,
// in the exact same order as src/books.ts (verified by inspection at
// integration time) — book N in BOOKS corresponds to bollsBookId N+1's
// position, i.e. array index + 1.
const BASE_URL = "https://bolls.life";
export const SOURCE_TRANSLATION_CODE = "WEB";

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
    .replace(/<[^>]+>/g, "") // strip embedded markup, e.g. <b>A Psalm of David.</b>
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

export async function fetchBookList(): Promise<BollsBook[]> {
  const books = await fetchJson<BollsBook[]>(`${BASE_URL}/get-books/${SOURCE_TRANSLATION_CODE}/`);
  return books.filter((b) => b.bookid >= 1 && b.bookid <= 66).sort((a, b) => a.bookid - b.bookid);
}

async function fetchChapter(
  bookCode: string,
  bollsBookId: number,
  chapter: number,
): Promise<FetchedVerse[]> {
  const verses = await fetchJson<BollsVerse[]>(
    `${BASE_URL}/get-text/${SOURCE_TRANSLATION_CODE}/${bollsBookId}/${chapter}/`,
  );
  return verses.map((v) => ({
    translation: SOURCE_TRANSLATION_CODE,
    book: bookCode,
    chapter,
    verse: v.verse,
    text: cleanText(v.text),
  }));
}

// Fetches the whole translation, `concurrency` chapters at a time, calling
// `onChapter` as each chapter completes so callers can insert incrementally
// rather than holding ~31k verses in memory at once.
export async function fetchWebTranslation(
  onChapter: (verses: FetchedVerse[], progress: { done: number; total: number }) => Promise<void>,
  concurrency = 8,
): Promise<void> {
  const bollsBooks = await fetchBookList();
  if (bollsBooks.length !== 66) {
    throw new Error(`Expected 66 canonical books from bolls.life, got ${bollsBooks.length}`);
  }

  type Job = { bookCode: string; bollsBookId: number; chapter: number };
  const jobs: Job[] = [];
  BOOKS.forEach((book, i) => {
    const bollsBook = bollsBooks[i];
    if (bollsBook.name.replace(/^\d /, "").toLowerCase() !== book.name.replace(/^\d /, "").toLowerCase()) {
      throw new Error(
        `Book order mismatch at index ${i}: expected "${book.name}", bolls.life has "${bollsBook.name}"`,
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
      const verses = await fetchChapter(job.bookCode, job.bollsBookId, job.chapter);
      await onChapter(verses, { done: ++done, total: jobs.length });
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => worker()));
}
