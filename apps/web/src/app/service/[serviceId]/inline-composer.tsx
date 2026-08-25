"use client";

import { useState, useTransition } from "react";
import { IconBook2, IconMusic, IconSpeakerphone, IconTypography, IconX, type Icon } from "@tabler/icons-react";
import {
  addAnnouncementSlideCueAction,
  addCueItemAction,
  addCustomTextCueAction,
  addOneOffCustomTextCueAction,
  addSongArrangementCueAction,
  addSongSectionCueAction,
  createAndAddCustomTextCueAction,
} from "@/lib/services/actions";
import type { CueSection } from "@/lib/services/cue-sections";
import type { CueItemType } from "@/lib/services/types";
import { VerseSearch } from "@/components/verse-search";
import { Field } from "@/components/ui";
import { CUE_TYPE_COLOR } from "@/components/cue-type-badge";

type LibrarySong = {
  id: string;
  title: string;
  lastArrangement: string[] | null;
  sections: { id: string; label: string; lyrics: string }[];
};
type LibraryAnnouncement = { id: string; title: string; slides: { id: string; text: string }[] };
type LibraryCustomText = { id: string; title: string; text: string };

const TYPE_PICKS: { type: CueItemType; label: string; icon: Icon }[] = [
  { type: "verse", label: "Scripture", icon: IconBook2 },
  { type: "song_section", label: "Song", icon: IconMusic },
  { type: "announcement_slide", label: "Announcement", icon: IconSpeakerphone },
  { type: "custom_text", label: "Text", icon: IconTypography },
];

/**
 * Lives inside a section's own header — not a separate top-of-page panel —
 * so adding an item is never disconnected from where it lands. Icon-coded
 * type picker first, then whichever quick-add fields fit that type; every
 * add refetches the outline (see onAdded) instead of a full page reload.
 */
export function InlineComposer({
  serviceId,
  section,
  translation,
  librarySongs,
  libraryAnnouncements,
  libraryCustomTexts,
  onAdded,
  onClose,
}: {
  serviceId: string;
  section: CueSection;
  translation: string;
  librarySongs: LibrarySong[];
  libraryAnnouncements: LibraryAnnouncement[];
  libraryCustomTexts: LibraryCustomText[];
  onAdded: () => void;
  onClose: () => void;
}) {
  const [type, setType] = useState<CueItemType | null>(null);
  const [isPending, startTransition] = useTransition();

  return (
    <div className="border-accent-gold/30 bg-background mt-3 rounded-xl border p-3.5">
      <div className="flex items-center justify-between gap-2">
        <div className="flex gap-1.5">
          {TYPE_PICKS.map((pick) => {
            const active = type === pick.type;
            const color = CUE_TYPE_COLOR[pick.type];
            return (
              <button
                key={pick.type}
                type="button"
                onClick={() => setType(pick.type)}
                style={active ? { borderColor: color, color, backgroundColor: `color-mix(in srgb, ${color} 12%, transparent)` } : undefined}
                className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors ${
                  active ? "" : "border-border text-text-secondary hover:text-text-primary"
                }`}
              >
                <pick.icon size={14} stroke={1.75} aria-hidden="true" />
                {pick.label}
              </button>
            );
          })}
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="shrink-0 rounded-lg p-1 text-text-secondary hover:bg-surface hover:text-text-primary"
        >
          <IconX size={16} stroke={1.75} aria-hidden="true" />
        </button>
      </div>

      {type && (
        <div className="mt-3">
          {type === "verse" && (
            <VerseSearch
              selectLabel="Add to outline"
              translation={translation}
              onSelect={(verse) =>
                startTransition(async () => {
                  await addCueItemAction(serviceId, section, verse);
                  onAdded();
                })
              }
            />
          )}

          {type === "song_section" && (
            <SongPicker
              songs={librarySongs}
              disabled={isPending}
              onAdd={(sectionId) =>
                startTransition(async () => {
                  await addSongSectionCueAction(serviceId, section, sectionId);
                  onAdded();
                })
              }
              onAddArrangement={(songId) =>
                startTransition(async () => {
                  await addSongArrangementCueAction(serviceId, section, songId);
                  onAdded();
                })
              }
            />
          )}

          {type === "announcement_slide" && (
            <AnnouncementPicker
              announcements={libraryAnnouncements}
              disabled={isPending}
              onAdd={(slideId) =>
                startTransition(async () => {
                  await addAnnouncementSlideCueAction(serviceId, section, slideId);
                  onAdded();
                })
              }
            />
          )}

          {type === "custom_text" && (
            <CustomTextComposer
              items={libraryCustomTexts}
              disabled={isPending}
              onAddExisting={(id) =>
                startTransition(async () => {
                  await addCustomTextCueAction(serviceId, section, id);
                  onAdded();
                })
              }
              onCreate={(title, text, saveToLibrary) =>
                startTransition(async () => {
                  if (saveToLibrary) {
                    await createAndAddCustomTextCueAction(serviceId, section, title, text);
                  } else {
                    await addOneOffCustomTextCueAction(serviceId, section, title, text);
                  }
                  onAdded();
                })
              }
            />
          )}

          {isPending && <p className="mt-2 text-xs text-text-secondary">Adding…</p>}
        </div>
      )}
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
    return <p className="text-sm text-text-secondary">No songs in the library yet — add one from Library.</p>;
  }

  const selectClass =
    "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-text-primary focus:border-accent-gold focus:ring-1 focus:ring-accent-gold focus:outline-none";

  return (
    <div className="space-y-2.5">
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
              className="border-accent-gold/40 bg-accent-gold/10 text-accent-gold w-full rounded-lg border px-3 py-2 text-left text-sm font-medium hover:bg-accent-gold/20 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Reuse last arrangement ({selected.lastArrangement.length} section
              {selected.lastArrangement.length === 1 ? "" : "s"})
            </button>
          )}
          <ul className="max-h-40 space-y-2 overflow-y-auto">
            {selected.sections.map((section) => (
              <li
                key={section.id}
                className="flex items-start justify-between gap-3 rounded-lg border border-border bg-surface p-2.5"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-accent-gold">{section.label}</p>
                  <p className="mt-0.5 line-clamp-1 text-xs text-text-secondary">{section.lyrics}</p>
                </div>
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => onAdd(section.id)}
                  className="shrink-0 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-text-primary hover:bg-background disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Add
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
    return <p className="text-sm text-text-secondary">No announcements in the library yet — add one from Library.</p>;
  }

  return (
    <div className="space-y-2.5">
      <select
        value={selectedId}
        onChange={(e) => setSelectedId(e.target.value)}
        className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-text-primary focus:border-accent-gold focus:ring-1 focus:ring-accent-gold focus:outline-none"
      >
        {announcements.map((a) => (
          <option key={a.id} value={a.id}>
            {a.title}
          </option>
        ))}
      </select>

      {selected && (
        <ul className="max-h-40 space-y-2 overflow-y-auto">
          {selected.slides.map((slide, i) => (
            <li
              key={slide.id}
              className="flex items-start justify-between gap-3 rounded-lg border border-border bg-surface p-2.5"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium text-accent-gold">Slide {i + 1}</p>
                <p className="mt-0.5 line-clamp-1 text-xs text-text-secondary">{slide.text}</p>
              </div>
              <button
                type="button"
                disabled={disabled}
                onClick={() => onAdd(slide.id)}
                className="shrink-0 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-text-primary hover:bg-background disabled:cursor-not-allowed disabled:opacity-50"
              >
                Add
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function CustomTextComposer({
  items,
  disabled,
  onAddExisting,
  onCreate,
}: {
  items: LibraryCustomText[];
  disabled: boolean;
  onAddExisting: (id: string) => void;
  onCreate: (title: string, text: string, saveToLibrary: boolean) => void;
}) {
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [saveToLibrary, setSaveToLibrary] = useState(true);

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <Field label="Title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Welcome" />
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
        {/* Explicit, per the design spec — otherwise whether this is a
            one-off or a reusable Library entry was two silent, seemingly-
            unrelated paths. */}
        <label className="flex items-center gap-2 text-xs text-text-secondary">
          <input
            type="checkbox"
            checked={saveToLibrary}
            onChange={(e) => setSaveToLibrary(e.target.checked)}
            className="accent-accent-gold h-3.5 w-3.5"
          />
          Save to library for reuse later
        </label>
        <button
          type="button"
          disabled={disabled || !title.trim() || !text.trim()}
          onClick={() => {
            onCreate(title, text, saveToLibrary);
            setTitle("");
            setText("");
          }}
          className="bg-accent-gold text-accent-gold-ink rounded-lg px-4 py-2 text-sm font-medium hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Add to outline
        </button>
      </div>

      {items.length > 0 && (
        <div className="border-t border-border pt-3">
          <p className="mb-2 text-xs font-medium text-text-secondary uppercase">Reuse existing</p>
          <ul className="max-h-32 space-y-2 overflow-y-auto">
            {items.map((item) => (
              <li
                key={item.id}
                className="flex items-start justify-between gap-3 rounded-lg border border-border bg-surface p-2.5"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-accent-gold">{item.title}</p>
                  <p className="mt-0.5 line-clamp-1 text-xs text-text-secondary">{item.text}</p>
                </div>
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => onAddExisting(item.id)}
                  className="shrink-0 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-text-primary hover:bg-background disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Add
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
