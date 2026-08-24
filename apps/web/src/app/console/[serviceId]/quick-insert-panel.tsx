"use client";

import { useState } from "react";
import { VerseSearch } from "@/components/verse-search";
import type { VerseSearchResult } from "@/lib/services/search";
import type { LiveItem } from "./types";

export type LibrarySong = {
  id: string;
  title: string;
  sections: { id: string; label: string; lyrics: string }[];
};

const TABS = ["Text", "Song", "Scripture"] as const;
type Tab = (typeof TABS)[number];

type PushableItem = Omit<LiveItem, "source">;

/**
 * Always-available ad-hoc push area, separate from the order-of-service cue
 * list — for when the pastor goes off-script and the media team needs to
 * respond immediately (custom text, a song section, or a scripture search)
 * without derailing the planned cue list. See control-console.tsx's
 * pushQuickLive: these pushes never touch activeCueId.
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

  return (
    <div className="p-6">
      <h2 className="text-sm font-medium tracking-wide text-accent-gold uppercase">Quick insert</h2>
      <p className="mt-1 text-xs text-text-secondary">
        Push something ad hoc without leaving your place in the order of service.
      </p>

      <div className="mt-4 flex gap-1 border-b border-border">
        {TABS.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
              tab === t
                ? "border-accent-gold text-accent-gold"
                : "border-transparent text-text-secondary hover:text-text-primary"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      <div className="pt-4">
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
            onSelect={(verse: VerseSearchResult) =>
              onPush({
                type: "verse",
                label: verse.label,
                text: verse.text,
                reference: {
                  translation: verse.translation,
                  book: verse.book,
                  chapter: verse.chapter,
                  verse: verse.verse,
                },
              })
            }
          />
        )}
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
        rows={3}
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
        className="rounded-lg bg-accent-gold px-4 py-2 text-sm font-medium text-background hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
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
    <div className="space-y-3">
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
            <ul className="space-y-2">
              {selected.sections.map((section) => (
                <li
                  key={section.id}
                  className="flex items-start justify-between gap-3 rounded-lg border border-border bg-background p-3"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-accent-gold">{section.label}</p>
                    <p className="mt-0.5 line-clamp-2 text-sm text-text-secondary">{section.lyrics}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => onPush(selected, section)}
                    className="shrink-0 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-text-primary hover:bg-surface"
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
