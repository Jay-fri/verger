"use client";

import { useActionState, useState } from "react";
import { createSongAction, type LibraryActionState } from "@/lib/library/actions";
import { Field, SubmitButton, ErrorMessage } from "@/components/ui";

const initialState: LibraryActionState = { error: null };

export function SongForm() {
  const [state, formAction] = useActionState(createSongAction, initialState);
  const [rowCount, setRowCount] = useState(2);

  return (
    <form action={formAction} className="mt-4 space-y-4">
      <Field label="Song title" name="title" type="text" required placeholder="e.g. Amazing Grace" />

      <div className="space-y-3">
        <span className="block text-sm font-medium text-text-primary">Sections</span>
        {Array.from({ length: rowCount }).map((_, i) => (
          <div key={i} className="flex flex-col gap-2 rounded-lg border border-border p-3 sm:flex-row">
            <input
              name="sectionLabel"
              placeholder="Verse 1"
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-text-primary placeholder:text-text-secondary focus:border-accent-gold focus:ring-1 focus:ring-accent-gold focus:outline-none sm:w-40 sm:shrink-0"
            />
            <textarea
              name="sectionLyrics"
              placeholder="Lyrics for this section…"
              rows={2}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-text-primary placeholder:text-text-secondary focus:border-accent-gold focus:ring-1 focus:ring-accent-gold focus:outline-none"
            />
          </div>
        ))}
        <button
          type="button"
          onClick={() => setRowCount((n) => n + 1)}
          className="text-xs font-medium text-accent-gold hover:underline"
        >
          + Add another section
        </button>
      </div>

      <ErrorMessage>{state.error}</ErrorMessage>
      <SubmitButton pendingChildren="Saving…">Save song</SubmitButton>
    </form>
  );
}
