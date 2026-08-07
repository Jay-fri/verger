"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { addCueItemAction, removeCueItemAction, moveCueItemAction } from "@/lib/services/actions";
import { VerseSearch } from "@/components/verse-search";
import type { VerseSearchResult } from "@/lib/services/search";

type Service = { id: string; title: string; status: string };
type CueItem = {
  id: string;
  position: number;
  book: string;
  chapter: number;
  verse: number;
  label: string;
  text: string;
  translation: string;
};

export function OutlineEditor({
  service,
  initialCueItems,
}: {
  service: Service;
  initialCueItems: CueItem[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handleAdd(verse: VerseSearchResult) {
    startTransition(async () => {
      await addCueItemAction(service.id, verse);
      router.refresh();
    });
  }

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
          Add a verse
        </h2>
        <div className="mt-4">
          <VerseSearch onSelect={handleAdd} selectLabel="Add to outline" />
        </div>
      </section>

      <section className="rounded-xl border border-border bg-surface p-6">
        <h2 className="text-sm font-medium tracking-wide text-accent-gold uppercase">Outline</h2>
        {initialCueItems.length === 0 ? (
          <p className="mt-4 text-sm text-text-secondary">
            No verses yet — search above to add the first one.
          </p>
        ) : (
          <ol className="mt-4 space-y-2">
            {initialCueItems.map((item, index) => (
              <li
                key={item.id}
                className="flex items-start justify-between gap-3 rounded-lg border border-border bg-background p-3"
              >
                <div className="flex min-w-0 items-start gap-3">
                  <span className="mt-0.5 text-xs font-medium text-text-secondary">
                    {index + 1}
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-accent-gold">{item.label}</p>
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
                    disabled={isPending || index === initialCueItems.length - 1}
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
    </div>
  );
}
