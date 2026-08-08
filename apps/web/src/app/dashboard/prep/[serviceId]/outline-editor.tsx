"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { removeCueItemAction, moveCueItemAction } from "@/lib/services/actions";
import { CUE_SECTIONS, CUE_SECTION_LABELS, LOOPING_SECTIONS, groupBySection } from "@/lib/services/cue-sections";
import type { CueItem } from "@/lib/services/types";
import { CueTypeBadge } from "@/components/cue-type-badge";
import { AddContentTabs } from "./add-content-tabs";

type Service = { id: string; title: string; status: string };
type LibrarySong = {
  id: string;
  title: string;
  lastArrangement: string[] | null;
  sections: { id: string; label: string; lyrics: string }[];
};
type LibraryAnnouncement = { id: string; title: string; slides: { id: string; text: string }[] };
type LibraryCustomText = { id: string; title: string; text: string };

export function OutlineEditor({
  service,
  initialCueItems,
  librarySongs,
  libraryAnnouncements,
  libraryCustomTexts,
}: {
  service: Service;
  initialCueItems: CueItem[];
  librarySongs: LibrarySong[];
  libraryAnnouncements: LibraryAnnouncement[];
  libraryCustomTexts: LibraryCustomText[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const grouped = groupBySection(initialCueItems);

  function handleRemove(cueItemId: string) {
    startTransition(async () => {
      await removeCueItemAction(service.id, cueItemId);
      router.refresh();
    });
  }

  function handleMove(cueItemId: string, direction: "up" | "down") {
    startTransition(async () => {
      await moveCueItemAction(service.id, cueItemId, direction);
      router.refresh();
    });
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium tracking-wide text-accent-gold uppercase">Prep</p>
          <h1 className="mt-1 text-2xl font-semibold text-text-primary">{service.title}</h1>
        </div>
        <Link
          href={`/console/${service.id}`}
          className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-text-primary hover:bg-background"
        >
          Open in Control console
        </Link>
      </div>

      <section className="rounded-xl border border-border bg-surface p-6">
        <h2 className="text-sm font-medium tracking-wide text-accent-gold uppercase">
          Add content
        </h2>
        <div className="mt-4">
          <AddContentTabs
            serviceId={service.id}
            librarySongs={librarySongs}
            libraryAnnouncements={libraryAnnouncements}
            libraryCustomTexts={libraryCustomTexts}
          />
        </div>
      </section>

      {CUE_SECTIONS.map((section) => {
        const items = grouped[section];
        const isLooping = LOOPING_SECTIONS.has(section);
        return (
          <section key={section} className="rounded-xl border border-border bg-surface p-6">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-medium tracking-wide text-accent-gold uppercase">
                {CUE_SECTION_LABELS[section]}
              </h2>
              {isLooping && (
                <span
                  title="Next/Previous wraps around within this section during a live session, instead of stopping or falling into the next section"
                  className="rounded-full bg-accent-gold/15 px-2 py-0.5 text-[10px] font-medium tracking-wide text-accent-gold uppercase"
                >
                  Loops
                </span>
              )}
            </div>
            {items.length === 0 ? (
              <p className="mt-4 text-sm text-text-secondary">Nothing here yet.</p>
            ) : (
              <ol className="mt-4 space-y-2">
                {items.map((item, index) => (
                  <li
                    key={item.id}
                    className="flex items-start justify-between gap-3 rounded-lg border border-border bg-background p-3"
                  >
                    <div className="flex min-w-0 items-start gap-3">
                      <span className="mt-0.5 text-xs font-medium text-text-secondary">
                        {index + 1}
                      </span>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <CueTypeBadge type={item.type} />
                          <p className="text-sm font-medium text-accent-gold">{item.label}</p>
                        </div>
                        <p className="mt-0.5 line-clamp-2 text-sm text-text-secondary">{item.text}</p>
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <button
                        type="button"
                        disabled={isPending || index === 0}
                        onClick={() => handleMove(item.id, "up")}
                        aria-label="Move up"
                        className="rounded border border-border px-2 py-1 text-xs text-text-primary hover:bg-surface disabled:opacity-30"
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        disabled={isPending || index === items.length - 1}
                        onClick={() => handleMove(item.id, "down")}
                        aria-label="Move down"
                        className="rounded border border-border px-2 py-1 text-xs text-text-primary hover:bg-surface disabled:opacity-30"
                      >
                        ↓
                      </button>
                      <button
                        type="button"
                        disabled={isPending}
                        onClick={() => handleRemove(item.id)}
                        aria-label="Remove"
                        className="text-live hover:bg-live/10 rounded border border-border px-2 py-1 text-xs"
                      >
                        ✕
                      </button>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </section>
        );
      })}
    </div>
  );
}
