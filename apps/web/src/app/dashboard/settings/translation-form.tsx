"use client";

import { useActionState } from "react";
import { BIBLE_TRANSLATIONS } from "@verger/shared-types";
import { updateChurchDefaultTranslationAction } from "@/lib/settings/actions";
import { ErrorMessage, SubmitButton } from "@/components/ui";

export function TranslationForm({ currentTranslation }: { currentTranslation: string }) {
  const [state, formAction] = useActionState(updateChurchDefaultTranslationAction, { error: null });

  return (
    <div className="space-y-2">
      <form action={formAction} className="flex items-end gap-2">
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-text-primary">Default translation</span>
          <select
            name="translation"
            defaultValue={currentTranslation}
            className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-text-primary focus:border-accent-gold focus:ring-1 focus:ring-accent-gold focus:outline-none"
          >
            {BIBLE_TRANSLATIONS.map((t) => (
              <option key={t.code} value={t.code}>
                {t.label}
              </option>
            ))}
          </select>
        </label>
        <SubmitButton variant="secondary" pendingChildren="Saving…">
          Save
        </SubmitButton>
      </form>
      <ErrorMessage>{state.error}</ErrorMessage>
    </div>
  );
}
