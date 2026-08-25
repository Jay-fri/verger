"use client";

import { useActionState, useState } from "react";
import { createCustomTextAction, type LibraryActionState } from "@/lib/library/actions";
import { Field, SubmitButton, ErrorMessage } from "@/components/ui";
import { StagePreview } from "@/components/stage-preview";

const initialState: LibraryActionState = { error: null };

export function CustomTextForm() {
  const [state, formAction] = useActionState(createCustomTextAction, initialState);
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");

  return (
    <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_260px]">
      <form action={formAction} className="space-y-4">
        <Field
          label="Title"
          name="title"
          type="text"
          required
          placeholder="e.g. Welcome"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-text-primary">Text</span>
          <textarea
            name="text"
            rows={3}
            placeholder="Whatever you want on screen…"
            value={text}
            onChange={(e) => setText(e.target.value)}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-text-primary placeholder:text-text-secondary focus:border-accent-gold focus:ring-1 focus:ring-accent-gold focus:outline-none"
          />
        </label>
        <ErrorMessage>{state.error}</ErrorMessage>
        <SubmitButton pendingChildren="Saving…">Save custom text</SubmitButton>
      </form>
      <div>
        <p className="mb-1.5 text-[11px] font-medium tracking-wide text-text-secondary uppercase">Stage preview</p>
        <StagePreview text={text} label={title} />
      </div>
    </div>
  );
}
