"use client";

import { useState } from "react";
import { IconBook2, IconBooks, IconMusic, IconTypography, type Icon } from "@tabler/icons-react";
import { VerseSearch } from "@/components/verse-search";
import type { VerseSearchResult } from "@/lib/services/search";
import { BibleBrowse } from "./bible-browse";
import type { LiveItem } from "./types";

export type LibrarySong = {
  id: string;
  title: string;
  sections: { id: string; label: string; lyrics: string }[];
};

const TABS: { key: "Text" | "Song" | "Scripture" | "Browse"; label: string; icon: Icon }[] = [
  { key: "Text", label: "Text", icon: IconTypography },
  { key: "Song", label: "Song", icon: IconMusic },
  { key: "Scripture", label: "Search", icon: IconBook2 },
  { key: "Browse", label: "Browse", icon: IconBooks },
];
type Tab = (typeof TABS)[number]["key"];

type PushableItem = Omit<LiveItem, "source">;

/**
 * Its own column in Live mode — for when the pastor goes off-script and the
 * media team needs to respond immediately (custom text, a song section, a
 * scripture search, or a book/chapter/verse browse) without derailing the
 * planned cue list. Pushes here never touch activeCueId — see
 * service-screen.tsx's pushQuickLive. Same header/scrollable-content shape
 * as the other two Live-mode columns (order-of-service-panel.tsx,
 * ai-detected-pane.tsx) so all three fill their column consistently.
 */
export function QuickInsertPanel({
  librarySongs,
  onPush,
  translation,
}: {
  librarySongs: LibrarySong[];
  onPush: (item: PushableItem) => void;
  translation: string;
}) {
  const [tab, setTab] = useState<Tab>("Text");

  function pushVerse(verse: VerseSearchResult) {
    onPush({
      type: "verse",
      label: verse.label,
      text: verse.text,
      reference: { translation: verse.translation, book: verse.book, chapter: verse.chapter, verse: verse.verse },
    });
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="shrink-0 border-b border-border p-4">
        <h2 className="text-xs font-medium tracking-wide text-accent-gold uppercase">Quick insert</h2>
        {/* 2x2 grid, not a single row — this column is a fixed 280px, too
            narrow for four icon+label tabs in one line (that overflowed and
            clipped "Browse" down to "B" when this panel moved here from the
            wider middle column). */}
        <div className="mt-3 grid grid-cols-2 gap-1.5">
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={`flex items-center justify-center gap-1.5 rounded-lg border px-2 py-1.5 text-xs font-medium transition-colors ${
                tab === t.key
                  ? "border-accent-gold bg-accent-gold/10 text-accent-gold"
                  : "border-border text-text-secondary hover:text-text-primary"
              }`}
            >
              <t.icon size={14} stroke={1.75} aria-hidden="true" />
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {tab === "Text" && (
          <TextTab
            onPush={(text) => onPush({ type: "custom_text", label: "Custom text", text, reference: null })}
          />
        )}

        {tab === "Song" && (
          <SongTab
            songs={librarySongs}
            onPush={(song, section) =>
              onPush({
                type: "song_section",
                label: `${song.title} — ${section.label}`,
                text: section.lyrics,
                reference: null,
              })
            }
          />
        )}

        {tab === "Scripture" && (
          <VerseSearch
            selectLabel="Push live"
            placeholder="Search a reference or paraphrase…"
            translation={translation}
            onSelect={pushVerse}
          />
        )}

        {tab === "Browse" && <BibleBrowse translation={translation} onSelectVerse={pushVerse} />}
      </div>
    </div>
  );
}

function TextTab({ onPush }: { onPush: (text: string) => void }) {
  const [text, setText] = useState("");

  return (
    <div className="space-y-2">
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={2}
        placeholder="Whatever you want on screen…"
        className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-text-primary placeholder:text-text-secondary focus:border-accent-gold focus:ring-1 focus:ring-accent-gold focus:outline-none"
      />
      <button
        type="button"
        disabled={!text.trim()}
        onClick={() => {
          onPush(text.trim());
          setText("");
        }}
        className="bg-accent-gold text-accent-gold-ink rounded-lg px-4 py-1.5 text-sm font-medium hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
      >
        Push live
      </button>
    </div>
  );
}

function SongTab({
  songs,
  onPush,
}: {
  songs: LibrarySong[];
  onPush: (song: LibrarySong, section: LibrarySong["sections"][number]) => void;
}) {
  const [query, setQuery] = useState("");
  const filtered = songs.filter((s) => s.title.toLowerCase().includes(query.trim().toLowerCase()));
  const [selectedId, setSelectedId] = useState(songs[0]?.id ?? "");
  const selected = filtered.find((s) => s.id === selectedId) ?? filtered[0];

  if (songs.length === 0) {
    return (
      <p className="text-sm text-text-secondary">
        No songs in the library yet — add one from the Library page.
      </p>
    );
  }

  return (
    <div className="space-y-2.5">
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search songs…"
        className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-text-primary placeholder:text-text-secondary focus:border-accent-gold focus:ring-1 focus:ring-accent-gold focus:outline-none"
      />

      {filtered.length === 0 ? (
        <p className="text-sm text-text-secondary">No songs match &ldquo;{query}&rdquo;.</p>
      ) : (
        <>
          <select
            value={selected?.id ?? ""}
            onChange={(e) => setSelectedId(e.target.value)}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-text-primary focus:border-accent-gold focus:ring-1 focus:ring-accent-gold focus:outline-none"
          >
            {filtered.map((song) => (
              <option key={song.id} value={song.id}>
                {song.title}
              </option>
            ))}
          </select>

          {selected && (
            <ul className="max-h-40 space-y-1.5 overflow-y-auto">
              {selected.sections.map((section) => (
                <li
                  key={section.id}
                  className="flex items-start justify-between gap-3 rounded-lg border border-border bg-background p-2.5"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-accent-gold">{section.label}</p>
                    <p className="mt-0.5 line-clamp-1 text-xs text-text-secondary">{section.lyrics}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => onPush(selected, section)}
                    className="shrink-0 rounded-lg border border-border px-3 py-1 text-xs font-medium text-text-primary hover:bg-surface"
                  >
                    Push live
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
