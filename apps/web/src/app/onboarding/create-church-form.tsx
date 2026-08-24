"use client";

import { useActionState } from "react";
import { BIBLE_TRANSLATIONS } from "@verger/shared-types";
import { createChurchAction, type CreateChurchState } from "@/lib/onboarding/actions";
import { Field, SubmitButton, ErrorMessage } from "@/components/ui";

const initialState: CreateChurchState = { error: null };

export function CreateChurchForm() {
  const [state, formAction] = useActionState(createChurchAction, initialState);

  return (
    <form action={formAction} className="mt-6 space-y-4">
      <Field label="Church name" name="name" type="text" required autoComplete="organization" />

      <label className="block">
        <span className="mb-1 block text-sm font-medium text-text-primary">
          Default translation
        </span>
        <select
          name="translation"
          required
          defaultValue="WEB"
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-text-primary focus:border-accent-gold focus:ring-1 focus:ring-accent-gold focus:outline-none"
        >
          {BIBLE_TRANSLATIONS.map((translation) => (
            <option key={translation.code} value={translation.code}>
              {translation.label}
            </option>
          ))}
        </select>
      </label>

      <ErrorMessage>{state.error}</ErrorMessage>
      <SubmitButton pendingChildren="Creating…">Create church</SubmitButton>
    </form>
  );
}
