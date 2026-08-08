"use client";

import { useEffect, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import type { LiveStateRow } from "@/lib/services/live-state";

// Only the fields the audience Stage output actually renders — deliberately
// narrower than LiveStateRow: this never reads operatorMessage or next*,
// which are Stage confidence monitor-only (see monitor/[serviceId]).
type StageState = Pick<LiveStateRow, "source" | "type" | "label" | "text" | "mode">;
type LiveStateChangePayload = Pick<LiveStateRow, "source" | "type" | "label" | "text"> & { mode: string };

export function StageDisplay({
  serviceId,
  initialLiveItem,
  churchLogoDataUrl,
}: {
  serviceId: string;
  initialLiveItem: LiveStateRow | null;
  churchLogoDataUrl: string | null;
}) {
  const [item, setItem] = useState<StageState | null>(initialLiveItem);

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
          const row = payload.new as LiveStateChangePayload | undefined;
          if (!row) return;
          // A "clear"/"black"/"logo" push deliberately doesn't touch text —
          // per the panic-button spec, "keep any background" means the
          // underlying content row is left alone. So the usual `!row.text`
          // guard (an empty content push shouldn't blank the screen) only
          // applies in "content" mode; the three panic modes are valid with
          // no text at all.
          if (row.mode === "content" && !row.text) return;
          setItem({
            source: row.source as StageState["source"],
            type: row.type as StageState["type"],
            label: row.label,
            text: row.text,
            mode: (row.mode ?? "content") as StageState["mode"],
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

  if (item?.mode === "black") {
    return <div className="h-screen w-screen bg-black" />;
  }

  if (item?.mode === "logo") {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-background">
        {churchLogoDataUrl ? (
          // A data: URL, not an optimizable remote asset — next/image's loader doesn't apply here.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={churchLogoDataUrl} alt="Church logo" className="max-h-[70vh] max-w-[70vw] object-contain" />
        ) : (
          <p className="text-sm font-medium tracking-[0.3em] text-text-secondary/40 uppercase">
            No logo uploaded
          </p>
        )}
      </div>
    );
  }

  // "Clear" renders genuinely blank, not the Verger placeholder below — an
  // operator hitting Clear mid-service wants nothing on the big screen, not
  // a wordmark that could read as a glitch. The placeholder is reserved for
  // "no session has pushed anything live yet at all."
  if (item?.mode === "clear") {
    return <div className="h-screen w-screen bg-background" />;
  }

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
