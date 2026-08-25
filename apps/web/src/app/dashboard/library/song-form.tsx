"use client";

import { useActionState, useState } from "react";
import { createSongAction, type LibraryActionState } from "@/lib/library/actions";
import { Field, SubmitButton, ErrorMessage } from "@/components/ui";
import { StagePreview } from "@/components/stage-preview";

const initialState: LibraryActionState = { error: null };

export function SongForm() {
  const [state, formAction] = useActionState(createSongAction, initialState);
  const [title, setTitle] = useState("");
  const [sections, setSections] = useState([
    { label: "", lyrics: "" },
    { label: "", lyrics: "" },
  ]);
  const [previewIndex, setPreviewIndex] = useState(0);

  function updateSection(i: number, field: "label" | "lyrics", value: string) {
    setSections((prev) => prev.map((s, idx) => (idx === i ? { ...s, [field]: value } : s)));
  }

  const preview = sections[previewIndex];

  return (
    <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_260px]">
      <form action={formAction} className="space-y-4">
        <Field
          label="Song title"
          name="title"
          type="text"
          required
          placeholder="e.g. Amazing Grace"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />

        <div className="space-y-3">
          <span className="block text-sm font-medium text-text-primary">Sections</span>
          {sections.map((section, i) => (
            <div
              key={i}
              onFocus={() => setPreviewIndex(i)}
              className={`flex flex-col gap-2 rounded-lg border p-3 sm:flex-row ${
                previewIndex === i ? "border-accent-gold/40" : "border-border"
              }`}
            >
              <input
                name="sectionLabel"
                placeholder="Verse 1"
                value={section.label}
                onChange={(e) => updateSection(i, "label", e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-text-primary placeholder:text-text-secondary focus:border-accent-gold focus:ring-1 focus:ring-accent-gold focus:outline-none sm:w-40 sm:shrink-0"
              />
              <textarea
                name="sectionLyrics"
                placeholder="Lyrics for this section…"
                rows={2}
                value={section.lyrics}
                onChange={(e) => updateSection(i, "lyrics", e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-text-primary placeholder:text-text-secondary focus:border-accent-gold focus:ring-1 focus:ring-accent-gold focus:outline-none"
              />
            </div>
          ))}
          <button
            type="button"
            onClick={() => setSections((prev) => [...prev, { label: "", lyrics: "" }])}
            className="text-xs font-medium text-accent-gold hover:underline"
          >
            + Add another section
          </button>
        </div>

        <ErrorMessage>{state.error}</ErrorMessage>
        <SubmitButton pendingChildren="Saving…">Save song</SubmitButton>
      </form>
      <div>
        <div className="mb-1.5 flex items-center justify-between">
          <p className="text-[11px] font-medium tracking-wide text-text-secondary uppercase">Stage preview</p>
          {sections.length > 1 && (
            <div className="flex gap-1">
              {sections.map((_, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setPreviewIndex(i)}
                  aria-label={`Preview section ${i + 1}`}
                  className={`h-1.5 w-1.5 rounded-full ${previewIndex === i ? "bg-accent-gold" : "bg-border"}`}
                />
              ))}
            </div>
          )}
        </div>
        <StagePreview text={preview?.lyrics ?? ""} label={title ? `${title}${preview?.label ? ` — ${preview.label}` : ""}` : preview?.label} />
      </div>
    </div>
  );
}
