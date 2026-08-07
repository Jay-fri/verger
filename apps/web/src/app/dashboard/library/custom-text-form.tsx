"use client";

import { useActionState } from "react";
import { createCustomTextAction, type LibraryActionState } from "@/lib/library/actions";
import { Field, SubmitButton, ErrorMessage } from "@/components/ui";

const initialState: LibraryActionState = { error: null };

export function CustomTextForm() {
  const [state, formAction] = useActionState(createCustomTextAction, initialState);

  return (
    <form action={formAction} className="mt-4 space-y-4">
      <Field label="Title" name="title" type="text" required placeholder="e.g. Welcome" />
      <label className="block">
        <span className="mb-1 block text-sm font-medium text-text-primary">Text</span>
        <textarea
          name="text"
          rows={3}
          placeholder="Whatever you want on screen…"
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-text-primary placeholder:text-text-secondary focus:border-accent-gold focus:ring-1 focus:ring-accent-gold focus:outline-none"
        />
      </label>
      <ErrorMessage>{state.error}</ErrorMessage>
      <SubmitButton pendingChildren="Saving…">Save custom text</SubmitButton>
    </form>
  );
}
