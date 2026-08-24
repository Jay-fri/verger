"use client";

import { useState, useTransition, type FormEvent } from "react";
import { searchVersesAction, type VerseSearchResult } from "@/lib/services/search";

/**
 * The "manual search fallback" the design doc calls for — shared between
 * the Prep builder (adding key verses to an outline) and the Control
 * console (pushing a verse live on demand). Talks to the Bible data layer
 * via searchVersesAction: an exact reference resolves directly, anything
 * else falls back to semantic search, same dual-path behavior as the
 * detection engine.
 */
export function VerseSearch({
  onSelect,
  placeholder = "Search a reference or paraphrase…",
  selectLabel = "Add",
  translation,
}: {
  onSelect: (verse: VerseSearchResult) => void;
  placeholder?: string;
  selectLabel?: string;
  /** Which translation results are displayed in — omit to use the matching translation (WEB). */
  translation?: string;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<VerseSearchResult[]>([]);
  const [searched, setSearched] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleSearch(e: FormEvent) {
    e.preventDefault();
    const q = query;
    // Clear stale results immediately — otherwise the previous query's
    // results stay visible (and their "Add"/"Push live" buttons stay
    // clickable) for the entire round trip of the new search, so a click
    // during that window silently acts on the wrong verse.
    setResults([]);
    setSearched(false);
    startTransition(async () => {
      const found = await searchVersesAction(q, translation);
      setResults(found);
      setSearched(true);
    });
  }

  return (
    <div>
      <form onSubmit={handleSearch} className="flex gap-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={placeholder}
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-text-primary placeholder:text-text-secondary focus:border-accent-gold focus:ring-1 focus:ring-accent-gold focus:outline-none"
        />
        <button
          type="submit"
          disabled={isPending || !query.trim()}
          className="shrink-0 rounded-lg bg-accent-gold px-4 py-2 text-sm font-medium text-background transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isPending ? "Searching…" : "Search"}
        </button>
      </form>

      {searched && !isPending && results.length === 0 && (
        <p className="mt-3 text-sm text-text-secondary">No matches found.</p>
      )}

      {results.length > 0 && (
        <ul className="mt-3 space-y-2">
          {results.map((r) => (
            <li
              key={`${r.book}-${r.chapter}-${r.verse}`}
              className="flex items-start justify-between gap-3 rounded-lg border border-border bg-background p-3"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium text-accent-gold">{r.label}</p>
                <p className="mt-0.5 line-clamp-2 text-sm text-text-secondary">{r.text}</p>
              </div>
              <button
                type="button"
                onClick={() => onSelect(r)}
                className="shrink-0 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-text-primary hover:bg-surface"
              >
                {selectLabel}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
