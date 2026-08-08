"use client";

import { useEffect, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import type { LiveStateInput } from "@/lib/services/live-state";

type LiveStateRow = { source: string; type: string; label: string; text: string };

export function StageDisplay({
  serviceId,
  initialLiveItem,
}: {
  serviceId: string;
  initialLiveItem: LiveStateInput | null;
}) {
  const [item, setItem] = useState<LiveStateInput | null>(initialLiveItem);

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();

    // "*" (not just UPDATE) on purpose: the very first time anything is
    // pushed live for a service, live_state has no row yet, so that push
    // is an INSERT, not an UPDATE. Every push after that is an UPDATE
    // (setLiveStateAction upserts a single row per service).
    const channel = supabase
      .channel(`stage-${serviceId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "live_state", filter: `service_id=eq.${serviceId}` },
        (payload) => {
          const row = payload.new as LiveStateRow | undefined;
          if (!row?.text) return;
          setItem({
            source: row.source as LiveStateInput["source"],
            type: row.type as LiveStateInput["type"],
            label: row.label,
            text: row.text,
          });
        },
      )
      .subscribe((status, err) => {
        // Not shown on screen (this never renders) — just an aid for
        // diagnosing "why isn't my vMix source updating" via devtools.
        console.log("[stage] realtime subscription status:", status, err ?? "");
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [serviceId]);

  if (!item) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-background">
        <p className="text-sm font-medium tracking-[0.3em] text-text-secondary/40 uppercase">
          Verger
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-screen w-screen flex-col items-center justify-center bg-background px-16 text-center">
      <p className="text-3xl leading-snug text-balance text-text-primary sm:text-5xl md:text-6xl">
        {item.text}
      </p>
      {item.label && (
        <p className="mt-8 text-xl font-medium text-accent-gold sm:text-2xl">{item.label}</p>
      )}
    </div>
  );
}
