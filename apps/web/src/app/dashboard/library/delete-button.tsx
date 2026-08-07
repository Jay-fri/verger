"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";

export function DeleteButton({ onDelete }: { onDelete: () => Promise<void> }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={isPending}
      onClick={() =>
        startTransition(async () => {
          await onDelete();
          router.refresh();
        })
      }
      aria-label="Delete"
      className="text-live hover:bg-live/10 shrink-0 rounded border border-border px-2 py-1 text-xs disabled:opacity-30"
    >
      ✕
    </button>
  );
}
