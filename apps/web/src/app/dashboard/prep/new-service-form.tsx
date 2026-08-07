"use client";

import { useActionState } from "react";
import { createServiceAction, type CreateServiceState } from "@/lib/services/actions";
import { Field, SubmitButton, ErrorMessage } from "@/components/ui";

const initialState: CreateServiceState = { error: null };

export function NewServiceForm() {
  const [state, formAction] = useActionState(createServiceAction, initialState);

  return (
    <form action={formAction} className="mt-4 flex flex-wrap items-end gap-3">
      <div className="min-w-[260px] flex-1">
        <Field
          label="Title"
          name="title"
          type="text"
          required
          placeholder="e.g. Sunday Service — Aug 9"
        />
      </div>
      <div className="w-auto">
        <SubmitButton pendingChildren="Creating…">Create service</SubmitButton>
      </div>
      <div className="basis-full">
        <ErrorMessage>{state.error}</ErrorMessage>
      </div>
    </form>
  );
}
