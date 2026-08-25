"use client";

import { useFormStatus } from "react-dom";
import { IconArrowRight } from "@tabler/icons-react";
import { startThisWeeksServiceAction } from "@/lib/services/actions";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="bg-accent-gold text-accent-gold-ink flex shrink-0 items-center gap-2 rounded-lg px-5 py-2.5 text-sm font-semibold hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending ? "Starting…" : "Start prep"}
      {!pending && <IconArrowRight size={16} stroke={2} aria-hidden="true" />}
    </button>
  );
}

export function StartPrepButton() {
  return (
    <form action={startThisWeeksServiceAction}>
      <SubmitButton />
    </form>
  );
}
