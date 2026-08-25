"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { IconTrash } from "@tabler/icons-react";

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
      className="hover:text-danger hover:bg-danger/10 shrink-0 rounded-lg p-1.5 text-text-secondary/60 disabled:opacity-30"
    >
      <IconTrash size={15} stroke={1.75} aria-hidden="true" />
    </button>
  );
}
