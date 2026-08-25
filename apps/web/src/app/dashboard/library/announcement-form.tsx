"use client";

import { useActionState, useState } from "react";
import { createAnnouncementAction, type LibraryActionState } from "@/lib/library/actions";
import { Field, SubmitButton, ErrorMessage } from "@/components/ui";
import { StagePreview } from "@/components/stage-preview";

const initialState: LibraryActionState = { error: null };

export function AnnouncementForm() {
  const [state, formAction] = useActionState(createAnnouncementAction, initialState);
  const [title, setTitle] = useState("");
  const [slides, setSlides] = useState([""]);
  const [previewIndex, setPreviewIndex] = useState(0);

  function updateSlide(i: number, value: string) {
    setSlides((prev) => prev.map((s, idx) => (idx === i ? value : s)));
  }

  return (
    <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_260px]">
      <form action={formAction} className="space-y-4">
        <Field
          label="Announcement title"
          name="title"
          type="text"
          required
          placeholder="e.g. Potluck Dinner"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />

        <div className="space-y-3">
          <span className="block text-sm font-medium text-text-primary">Slides</span>
          {slides.map((slide, i) => (
            <textarea
              key={i}
              name="slideText"
              placeholder={`Slide ${i + 1} text…`}
              rows={2}
              value={slide}
              onFocus={() => setPreviewIndex(i)}
              onChange={(e) => updateSlide(i, e.target.value)}
              className={`w-full rounded-lg border bg-background px-3 py-2 text-sm text-text-primary placeholder:text-text-secondary focus:border-accent-gold focus:ring-1 focus:ring-accent-gold focus:outline-none ${
                previewIndex === i ? "border-accent-gold/40" : "border-border"
              }`}
            />
          ))}
          <button
            type="button"
            onClick={() => setSlides((prev) => [...prev, ""])}
            className="text-xs font-medium text-accent-gold hover:underline"
          >
            + Add another slide
          </button>
        </div>

        <ErrorMessage>{state.error}</ErrorMessage>
        <SubmitButton pendingChildren="Saving…">Save announcement</SubmitButton>
      </form>
      <div>
        <div className="mb-1.5 flex items-center justify-between">
          <p className="text-[11px] font-medium tracking-wide text-text-secondary uppercase">Stage preview</p>
          {slides.length > 1 && (
            <div className="flex gap-1">
              {slides.map((_, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setPreviewIndex(i)}
                  aria-label={`Preview slide ${i + 1}`}
                  className={`h-1.5 w-1.5 rounded-full ${previewIndex === i ? "bg-accent-gold" : "bg-border"}`}
                />
              ))}
            </div>
          )}
        </div>
        <StagePreview text={slides[previewIndex] ?? ""} label={title} />
      </div>
    </div>
  );
}
