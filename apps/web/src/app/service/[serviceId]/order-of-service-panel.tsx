"use client";

import { useState } from "react";
import { IconGripVertical, IconPlus, IconTrash } from "@tabler/icons-react";
import { removeCueItemAction, reorderCueItemsAction } from "@/lib/services/actions";
import { CUE_SECTIONS, CUE_SECTION_LABELS, LOOPING_SECTIONS, groupBySection, type CueSection } from "@/lib/services/cue-sections";
import { CueTypeIcon } from "@/components/cue-type-badge";
import { InlineComposer } from "./inline-composer";
import type { CueItem } from "./types";

type LibrarySong = {
  id: string;
  title: string;
  lastArrangement: string[] | null;
  sections: { id: string; label: string; lyrics: string }[];
};
type LibraryAnnouncement = { id: string; title: string; slides: { id: string; text: string }[] };
type LibraryCustomText = { id: string; title: string; text: string };

/**
 * The one order-of-service list — shared state, editable in Prep, operated
 * in Live, per the design spec. `mode` swaps affordances (composer/drag/
 * delete vs. click-to-push/active highlight) without changing what data
 * this renders or how it's grouped.
 */
export function OrderOfServicePanel({
  serviceId,
  cueItems,
  mode,
  editable,
  translation,
  librarySongs,
  libraryAnnouncements,
  libraryCustomTexts,
  activeCueId,
  onSelectLive,
  onOutlineRefresh,
  onReorderOptimistic,
}: {
  serviceId: string;
  cueItems: CueItem[];
  mode: "prep" | "live";
  editable: boolean;
  translation: string;
  librarySongs: LibrarySong[];
  libraryAnnouncements: LibraryAnnouncement[];
  libraryCustomTexts: LibraryCustomText[];
  activeCueId: string | null;
  onSelectLive: (item: CueItem) => void;
  onOutlineRefresh: () => void;
  onReorderOptimistic: (section: CueSection, orderedIds: string[]) => void;
}) {
  const grouped = groupBySection(cueItems);
  const [openComposer, setOpenComposer] = useState<CueSection | null>(null);
  const [dragging, setDragging] = useState<{ section: CueSection; id: string } | null>(null);

  async function handleRemove(cueItemId: string) {
    await removeCueItemAction(serviceId, cueItemId);
    onOutlineRefresh();
  }

  function handleDrop(section: CueSection, targetId: string) {
    if (!dragging || dragging.section !== section || dragging.id === targetId) {
      setDragging(null);
      return;
    }
    const ids = grouped[section].map((i) => i.id);
    const from = ids.indexOf(dragging.id);
    const to = ids.indexOf(targetId);
    if (from < 0 || to < 0) {
      setDragging(null);
      return;
    }
    const reordered = [...ids];
    reordered.splice(from, 1);
    reordered.splice(to, 0, dragging.id);
    setDragging(null);
    onReorderOptimistic(section, reordered);
    reorderCueItemsAction(serviceId, section, reordered).catch(() => {});
  }

  const isPrep = mode === "prep";

  return (
    <div className={`h-full ${isPrep ? "overflow-y-auto" : "flex flex-col overflow-hidden"}`}>
      {!isPrep && (
        <div className="border-b border-border p-4">
          <h2 className="text-sm font-medium tracking-wide text-accent-gold uppercase">Order of service</h2>
        </div>
      )}

      <div className={isPrep ? "space-y-6 p-1" : "flex-1 space-y-4 overflow-y-auto p-3"}>
        {cueItems.length === 0 && !isPrep && (
          <p className="p-3 text-sm text-text-secondary">No cue items in this outline.</p>
        )}

        {CUE_SECTIONS.map((section) => {
          const items = grouped[section];
          if (!isPrep && items.length === 0) return null;
          const isLooping = LOOPING_SECTIONS.has(section);

          return (
            <section
              key={section}
              className={isPrep ? "rounded-xl border border-border bg-surface p-5" : ""}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <p
                    className={
                      isPrep
                        ? "text-xs font-medium tracking-wide text-accent-gold uppercase"
                        : "px-1 text-[11px] font-medium tracking-wide text-text-secondary uppercase"
                    }
                  >
                    {CUE_SECTION_LABELS[section]}
                  </p>
                  {isLooping && isPrep && (
                    <span
                      title="Next/Previous wraps around within this section during a live session"
                      className="bg-accent-gold/15 text-accent-gold rounded-full px-2 py-0.5 text-[10px] font-medium tracking-wide uppercase"
                    >
                      Loops
                    </span>
                  )}
                </div>
                {isPrep && editable && (
                  <button
                    type="button"
                    onClick={() => setOpenComposer(openComposer === section ? null : section)}
                    className={`flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-medium transition-colors ${
                      openComposer === section
                        ? "bg-accent-gold text-accent-gold-ink"
                        : "border border-border text-text-secondary hover:text-text-primary"
                    }`}
                  >
                    <IconPlus size={14} stroke={2} aria-hidden="true" />
                    Add
                  </button>
                )}
              </div>

              {isPrep && openComposer === section && (
                <InlineComposer
                  serviceId={serviceId}
                  section={section}
                  translation={translation}
                  librarySongs={librarySongs}
                  libraryAnnouncements={libraryAnnouncements}
                  libraryCustomTexts={libraryCustomTexts}
                  onAdded={onOutlineRefresh}
                  onClose={() => setOpenComposer(null)}
                />
              )}

              {items.length === 0 ? (
                isPrep && <p className="mt-3 text-sm text-text-secondary">Nothing here yet.</p>
              ) : (
                <ol className={isPrep ? "mt-3 space-y-1.5" : "space-y-1.5"}>
                  {items.map((item) => {
                    const isActive = item.id === activeCueId;
                    if (isPrep) {
                      return (
                        <li
                          key={item.id}
                          draggable={editable}
                          onDragStart={() => setDragging({ section, id: item.id })}
                          onDragOver={(e) => e.preventDefault()}
                          onDrop={() => handleDrop(section, item.id)}
                          className={`flex items-center gap-2 rounded-lg border border-border bg-background p-2.5 ${
                            dragging?.id === item.id ? "opacity-40" : ""
                          }`}
                        >
                          {editable && (
                            <span className="cursor-grab text-text-secondary/60 active:cursor-grabbing" aria-hidden="true">
                              <IconGripVertical size={16} stroke={1.75} />
                            </span>
                          )}
                          <CueTypeIcon type={item.type} size={16} />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium text-text-primary">{item.label}</p>
                            <p className="truncate text-xs text-text-secondary">{item.text}</p>
                          </div>
                          {editable && (
                            <button
                              type="button"
                              onClick={() => handleRemove(item.id)}
                              aria-label="Remove"
                              className="hover:text-danger hover:bg-danger/10 shrink-0 rounded-lg p-1.5 text-text-secondary/60"
                            >
                              <IconTrash size={15} stroke={1.75} aria-hidden="true" />
                            </button>
                          )}
                        </li>
                      );
                    }

                    return (
                      <li key={item.id}>
                        <button
                          type="button"
                          onClick={() => onSelectLive(item)}
                          className={`w-full rounded-lg border p-2.5 text-left transition-colors ${
                            isActive
                              ? "border-accent-gold bg-accent-gold/10"
                              : "border-border bg-background hover:border-accent-gold/50"
                          }`}
                        >
                          <div className="flex items-center gap-1.5">
                            <CueTypeIcon type={item.type} size={14} />
                            <p className={`truncate text-sm font-medium ${isActive ? "text-accent-gold" : "text-text-primary"}`}>
                              {item.label}
                            </p>
                          </div>
                          <p className="mt-0.5 line-clamp-1 text-xs text-text-secondary">{item.text}</p>
                        </button>
                      </li>
                    );
                  })}
                </ol>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}
