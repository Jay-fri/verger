"use client";

import { useActionState, useState } from "react";
import { createAnnouncementAction, type LibraryActionState } from "@/lib/library/actions";
import { Field, SubmitButton, ErrorMessage } from "@/components/ui";

const initialState: LibraryActionState = { error: null };

export function AnnouncementForm() {
  const [state, formAction] = useActionState(createAnnouncementAction, initialState);
  const [rowCount, setRowCount] = useState(1);

  return (
    <form action={formAction} className="mt-4 space-y-4">
      <Field
        label="Announcement title"
        name="title"
        type="text"
        required
        placeholder="e.g. Potluck Dinner"
      />

      <div className="space-y-3">
        <span className="block text-sm font-medium text-text-primary">Slides</span>
        {Array.from({ length: rowCount }).map((_, i) => (
          <textarea
            key={i}
            name="slideText"
            placeholder={`Slide ${i + 1} text…`}
            rows={2}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-text-primary placeholder:text-text-secondary focus:border-accent-gold focus:ring-1 focus:ring-accent-gold focus:outline-none"
          />
        ))}
        <button
          type="button"
          onClick={() => setRowCount((n) => n + 1)}
          className="text-xs font-medium text-accent-gold hover:underline"
        >
          + Add another slide
        </button>
      </div>

      <ErrorMessage>{state.error}</ErrorMessage>
      <SubmitButton pendingChildren="Saving…">Save announcement</SubmitButton>
    </form>
  );
}
