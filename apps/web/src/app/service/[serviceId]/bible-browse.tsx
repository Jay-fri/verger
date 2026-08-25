"use client";

import { useEffect, useState, useTransition } from "react";
import { IconChevronRight } from "@tabler/icons-react";
import type { BookMeta } from "@verger/bible-data";
import { listBooksAction, listChaptersAction, listVersesAction, type VerseSearchResult } from "@/lib/services/search";

type Step = "books" | "chapters" | "verses";

/**
 * Book → chapter → verse drill-down, reachable from Quick Insert next to
 * search — the design spec's "Browse" option. Deliberately inline/
 * progressive (three steps in place, breadcrumb to step back) rather than a
 * modal, per the product register's "modal as first thought" ban. Selecting
 * a verse pushes it live immediately, same as a search result.
 */
export function BibleBrowse({
  translation,
  onSelectVerse,
}: {
  translation: string;
  onSelectVerse: (verse: VerseSearchResult) => void;
}) {
  const [step, setStep] = useState<Step>("books");
  const [books, setBooks] = useState<BookMeta[]>([]);
  const [book, setBook] = useState<BookMeta | null>(null);
  const [chapter, setChapter] = useState<number | null>(null);
  const [chapters, setChapters] = useState<number[]>([]);
  const [verses, setVerses] = useState<VerseSearchResult[]>([]);
  const [isPending, startTransition] = useTransition();

  // Static book metadata (no chapter/verse data), but fetched through a
  // server action rather than imported directly — @verger/bible-data's
  // barrel also re-exports the DB-backed resolve.ts, which pulls Node-only
  // modules (postgres, tls) into the client bundle if imported by value here.
  useEffect(() => {
    listBooksAction().then(setBooks);
  }, []);

  function pickBook(b: BookMeta) {
    setBook(b);
    setChapter(null);
    setChapters([]);
    setStep("chapters");
    startTransition(async () => {
      setChapters(await listChaptersAction(translation, b.code));
    });
  }

  function pickChapter(c: number) {
    if (!book) return;
    setChapter(c);
    setVerses([]);
    setStep("verses");
    startTransition(async () => {
      setVerses(await listVersesAction(translation, book.code, c));
    });
  }

  return (
    // h-full flex-col: the breadcrumb stays put, the grid/list below is the
    // ONE scroll region, sized by whatever the parent (Quick Insert's
    // content area) actually has available — not an arbitrary fixed height,
    // so it fills the column instead of leaving dead space below a short
    // capped box (see BookGrid/ChapterGrid/VerseGrid, which used to each
    // cap themselves at max-h-72 regardless of how much room was free).
    <div className="flex h-full flex-col">
      <nav className="mb-3 flex shrink-0 items-center gap-1 text-xs text-text-secondary">
        <button
          type="button"
          onClick={() => setStep("books")}
          className={step === "books" ? "font-medium text-text-primary" : "hover:text-text-primary"}
        >
          Books
        </button>
        {book && (
          <>
            <IconChevronRight size={12} stroke={2} aria-hidden="true" />
            <button
              type="button"
              onClick={() => setStep("chapters")}
              className={step === "chapters" ? "font-medium text-text-primary" : "hover:text-text-primary"}
            >
              {book.name}
            </button>
          </>
        )}
        {chapter !== null && (
          <>
            <IconChevronRight size={12} stroke={2} aria-hidden="true" />
            <span className="font-medium text-text-primary">Chapter {chapter}</span>
          </>
        )}
      </nav>

      <div className="min-h-0 flex-1 overflow-y-auto pr-1">
        {step === "books" && <BookGrid books={books} onPick={pickBook} />}

        {step === "chapters" && (
          <ChapterGrid chapters={chapters} loading={isPending} onPick={pickChapter} />
        )}

        {step === "verses" && (
          <VerseGrid verses={verses} loading={isPending} onSelect={onSelectVerse} />
        )}
      </div>
    </div>
  );
}

function BookGrid({ books, onPick }: { books: BookMeta[]; onPick: (book: BookMeta) => void }) {
  const ot = books.filter((b) => b.testament === "OT");
  const nt = books.filter((b) => b.testament === "NT");

  if (books.length === 0) return <p className="text-sm text-text-secondary">Loading books…</p>;

  return (
    <div className="space-y-4">
      {[
        ["Old Testament", ot],
        ["New Testament", nt],
      ].map(([label, books]) => (
        <div key={label as string}>
          <p className="mb-1.5 text-[11px] font-medium tracking-wide text-text-secondary uppercase">{label as string}</p>
          <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-4">
            {(books as BookMeta[]).map((b) => (
              <button
                key={b.code}
                type="button"
                onClick={() => onPick(b)}
                className="truncate rounded-lg border border-border bg-background px-2 py-1.5 text-left text-xs text-text-primary hover:border-accent-gold/50 hover:bg-surface"
                title={b.name}
              >
                {b.name}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function ChapterGrid({
  chapters,
  loading,
  onPick,
}: {
  chapters: number[];
  loading: boolean;
  onPick: (chapter: number) => void;
}) {
  if (loading) return <p className="text-sm text-text-secondary">Loading chapters…</p>;
  if (chapters.length === 0) return <p className="text-sm text-text-secondary">No chapters found.</p>;

  return (
    <div className="grid grid-cols-6 gap-1.5 sm:grid-cols-8">
      {chapters.map((c) => (
        <button
          key={c}
          type="button"
          onClick={() => onPick(c)}
          className="rounded-lg border border-border bg-background py-1.5 text-center text-xs text-text-primary hover:border-accent-gold/50 hover:bg-surface"
        >
          {c}
        </button>
      ))}
    </div>
  );
}

function VerseGrid({
  verses,
  loading,
  onSelect,
}: {
  verses: VerseSearchResult[];
  loading: boolean;
  onSelect: (verse: VerseSearchResult) => void;
}) {
  if (loading) return <p className="text-sm text-text-secondary">Loading verses…</p>;
  if (verses.length === 0) return <p className="text-sm text-text-secondary">No verses found.</p>;

  return (
    <ul className="space-y-1.5">
      {verses.map((v) => (
        <li key={v.verse}>
          <button
            type="button"
            onClick={() => onSelect(v)}
            className="flex w-full items-start gap-2 rounded-lg border border-border bg-background p-2.5 text-left hover:border-accent-gold/50 hover:bg-surface"
          >
            <span className="mt-0.5 shrink-0 text-xs font-medium text-accent-gold">{v.verse}</span>
            <span className="line-clamp-2 text-sm text-text-primary">{v.text}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}
