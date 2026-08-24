"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  addAnnouncementSlideCueAction,
  addCueItemAction,
  addCustomTextCueAction,
  addSongArrangementCueAction,
  addSongSectionCueAction,
  createAndAddCustomTextCueAction,
} from "@/lib/services/actions";
import { CUE_SECTIONS, CUE_SECTION_LABELS, type CueSection } from "@/lib/services/cue-sections";
import { VerseSearch } from "@/components/verse-search";
import { Field } from "@/components/ui";

type LibrarySong = {
  id: string;
  title: string;
  lastArrangement: string[] | null;
  sections: { id: string; label: string; lyrics: string }[];
};
type LibraryAnnouncement = { id: string; title: string; slides: { id: string; text: string }[] };
type LibraryCustomText = { id: string; title: string; text: string };

const TABS = ["Scripture", "Songs", "Announcements", "Custom text"] as const;
type Tab = (typeof TABS)[number];

const selectClass =
  "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-text-primary focus:border-accent-gold focus:ring-1 focus:ring-accent-gold focus:outline-none";
const addButtonClass =
  "shrink-0 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-text-primary hover:bg-surface disabled:cursor-not-allowed disabled:opacity-50";

export function AddContentTabs({
  serviceId,
  librarySongs,
  libraryAnnouncements,
  libraryCustomTexts,
  translation,
}: {
  serviceId: string;
  librarySongs: LibrarySong[];
  libraryAnnouncements: LibraryAnnouncement[];
  libraryCustomTexts: LibraryCustomText[];
  /** The church's default translation — Prep has no live session, so there's no per-session switcher here. */
  translation: string;
}) {
  const [tab, setTab] = useState<Tab>("Scripture");
  const [section, setSection] = useState<CueSection>("service");
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  return (
    <div>
      <div className="flex gap-1 border-b border-border">
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

      <label className="mt-4 block">
        <span className="mb-1 block text-xs font-medium text-text-secondary uppercase">Add to</span>
        <select
          value={section}
          onChange={(e) => setSection(e.target.value as CueSection)}
          className={selectClass}
        >
          {CUE_SECTIONS.map((s) => (
            <option key={s} value={s}>
              {CUE_SECTION_LABELS[s]}
            </option>
          ))}
        </select>
      </label>

      <div className="pt-4">
        {tab === "Scripture" && (
          <VerseSearch
            selectLabel="Add to outline"
            translation={translation}
            onSelect={(verse) =>
              startTransition(async () => {
                await addCueItemAction(serviceId, section, verse);
                router.refresh();
              })
            }
          />
        )}

        {tab === "Songs" && (
          <SongPicker
            songs={librarySongs}
            disabled={isPending}
            onAdd={(sectionId) =>
              startTransition(async () => {
                await addSongSectionCueAction(serviceId, section, sectionId);
                router.refresh();
              })
            }
            onAddArrangement={(songId) =>
              startTransition(async () => {
                await addSongArrangementCueAction(serviceId, section, songId);
                router.refresh();
              })
            }
          />
        )}

        {tab === "Announcements" && (
          <AnnouncementPicker
            announcements={libraryAnnouncements}
            disabled={isPending}
            onAdd={(slideId) =>
              startTransition(async () => {
                await addAnnouncementSlideCueAction(serviceId, section, slideId);
                router.refresh();
              })
            }
          />
        )}

        {tab === "Custom text" && (
          <CustomTextTab
            items={libraryCustomTexts}
            disabled={isPending}
            onAddExisting={(id) =>
              startTransition(async () => {
                await addCustomTextCueAction(serviceId, section, id);
                router.refresh();
              })
            }
            onCreateAndAdd={(title, text) =>
              startTransition(async () => {
                await createAndAddCustomTextCueAction(serviceId, section, title, text);
                router.refresh();
              })
            }
          />
        )}
      </div>
      {isPending && <p className="mt-2 text-xs text-text-secondary">Adding…</p>}
    </div>
  );
}

function SongPicker({
  songs,
  disabled,
  onAdd,
  onAddArrangement,
}: {
  songs: LibrarySong[];
  disabled: boolean;
  onAdd: (sectionId: string) => void;
  onAddArrangement: (songId: string) => void;
}) {
  const [selectedId, setSelectedId] = useState(songs[0]?.id ?? "");
  const selected = songs.find((s) => s.id === selectedId);

  if (songs.length === 0) {
    return (
      <p className="text-sm text-text-secondary">
        No songs in the library yet — add one from the Library page.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <select value={selectedId} onChange={(e) => setSelectedId(e.target.value)} className={selectClass}>
        {songs.map((song) => (
          <option key={song.id} value={song.id}>
            {song.title}
          </option>
        ))}
      </select>

      {selected && (
        <>
          {selected.lastArrangement && selected.lastArrangement.length > 0 && (
            <button
              type="button"
              disabled={disabled}
              onClick={() => onAddArrangement(selected.id)}
              className="w-full rounded-lg border border-accent-gold/40 bg-accent-gold/10 px-3 py-2 text-left text-sm font-medium text-accent-gold hover:bg-accent-gold/20 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Reuse last arrangement ({selected.lastArrangement.length} section
              {selected.lastArrangement.length === 1 ? "" : "s"})
            </button>
          )}
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
                  disabled={disabled}
                  onClick={() => onAdd(section.id)}
                  className={addButtonClass}
                >
                  Add to outline
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

function AnnouncementPicker({
  announcements,
  disabled,
  onAdd,
}: {
  announcements: LibraryAnnouncement[];
  disabled: boolean;
  onAdd: (slideId: string) => void;
}) {
  const [selectedId, setSelectedId] = useState(announcements[0]?.id ?? "");
  const selected = announcements.find((a) => a.id === selectedId);

  if (announcements.length === 0) {
    return (
      <p className="text-sm text-text-secondary">
        No announcements in the library yet — add one from the Library page.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <select value={selectedId} onChange={(e) => setSelectedId(e.target.value)} className={selectClass}>
        {announcements.map((a) => (
          <option key={a.id} value={a.id}>
            {a.title}
          </option>
        ))}
      </select>

      {selected && (
        <ul className="space-y-2">
          {selected.slides.map((slide, i) => (
            <li
              key={slide.id}
              className="flex items-start justify-between gap-3 rounded-lg border border-border bg-background p-3"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium text-accent-gold">Slide {i + 1}</p>
                <p className="mt-0.5 line-clamp-2 text-sm text-text-secondary">{slide.text}</p>
              </div>
              <button
                type="button"
                disabled={disabled}
                onClick={() => onAdd(slide.id)}
                className={addButtonClass}
              >
                Add to outline
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function CustomTextTab({
  items,
  disabled,
  onAddExisting,
  onCreateAndAdd,
}: {
  items: LibraryCustomText[];
  disabled: boolean;
  onAddExisting: (id: string) => void;
  onCreateAndAdd: (title: string, text: string) => void;
}) {
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Field
          label="Title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g. Welcome"
        />
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-text-primary">Text</span>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={2}
            placeholder="Whatever you want on screen…"
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-text-primary placeholder:text-text-secondary focus:border-accent-gold focus:ring-1 focus:ring-accent-gold focus:outline-none"
          />
        </label>
        <button
          type="button"
          disabled={disabled || !title.trim() || !text.trim()}
          onClick={() => {
            onCreateAndAdd(title, text);
            setTitle("");
            setText("");
          }}
          className="rounded-lg bg-accent-gold px-4 py-2 text-sm font-medium text-background hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Add to outline
        </button>
      </div>

      {items.length > 0 && (
        <div className="border-t border-border pt-4">
          <p className="mb-2 text-xs font-medium text-text-secondary uppercase">Reuse existing</p>
          <ul className="space-y-2">
            {items.map((item) => (
              <li
                key={item.id}
                className="flex items-start justify-between gap-3 rounded-lg border border-border bg-background p-3"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-accent-gold">{item.title}</p>
                  <p className="mt-0.5 line-clamp-1 text-sm text-text-secondary">{item.text}</p>
                </div>
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => onAddExisting(item.id)}
                  className={addButtonClass}
                >
                  Add to outline
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
