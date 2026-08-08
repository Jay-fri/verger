"use client";

import { useEffect, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import type { LiveStateRow } from "@/lib/services/live-state";

type MonitorState = Pick<LiveStateRow, "text" | "label" | "mode" | "nextLabel" | "nextText" | "operatorMessage">;

const MODE_LABEL: Record<string, string> = {
  clear: "CLEARED",
  black: "BLACK",
  logo: "LOGO",
};

/**
 * The Stage confidence monitor — a second, pastor/band-facing screen,
 * separate from the audience Stage output (src/app/stage/[serviceId]).
 * Deliberately styled as a dense utility screen (small, information-forward,
 * dark) rather than a broadcast graphic — nobody's pointing a camera at
 * this, so it doesn't need to look polished, it needs to be readable at a
 * glance from a music stand.
 */
export function MonitorDisplay({
  serviceId,
  initialLiveState,
}: {
  serviceId: string;
  initialLiveState: MonitorState | null;
}) {
  const [state, setState] = useState<MonitorState | null>(initialLiveState);

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();

    const channel = supabase
      .channel(`monitor-${serviceId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "live_state", filter: `service_id=eq.${serviceId}` },
        (payload) => {
          // Postgres Changes payloads mirror the raw database column names
          // (snake_case), not Drizzle's camelCase query-result shape — there's
          // no ORM in this path, it's the replication stream directly. Real
          // bug caught live-testing this: next_label/next_text/operator_message
          // silently came through as undefined (?? null swallowed it with no
          // error) because the code was reading row.nextLabel/nextText/
          // operatorMessage — camelCase keys that don't exist on this payload.
          // text/label/mode "worked" purely by accident: they're single-word
          // columns, so snake_case and camelCase happen to be identical.
          const row = payload.new as
            | { text: string; label: string; mode: string; next_label: string | null; next_text: string | null; operator_message: string | null }
            | undefined;
          if (!row) return;
          setState({
            text: row.text,
            label: row.label,
            mode: row.mode as MonitorState["mode"],
            nextLabel: row.next_label,
            nextText: row.next_text,
            operatorMessage: row.operator_message,
          });
        },
      )
      .subscribe((status, err) => {
        console.log("[monitor] realtime subscription status:", status, err ?? "");
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [serviceId]);

  const modeNote = state?.mode && state.mode !== "content" ? MODE_LABEL[state.mode] : null;

  return (
    <div className="flex h-screen w-screen flex-col gap-3 bg-black p-4 font-mono text-white">
      <div className="flex shrink-0 items-center justify-between border-b border-white/20 pb-2">
        <p className="text-[10px] tracking-[0.3em] text-white/40 uppercase">Verger · Confidence monitor</p>
        {modeNote && (
          <span className="rounded bg-white/10 px-2 py-0.5 text-[10px] font-bold tracking-wide text-white/80">
            STAGE SHOWING: {modeNote}
          </span>
        )}
      </div>

      {/* flex-[3] (not flex-1) on purpose — "Now" gets the biggest share
          of the screen but never grows enough to push Next/Message off a
          fixed-height physical monitor screen. Real bug caught live-testing:
          flex-1 here let a short "Now" text absorb the entire remaining
          height, silently pushing the operator message below the fold with
          no scroll affordance on a screen nobody scrolls. */}
      <div className="flex-3 overflow-y-auto rounded border border-white/10 p-4">
        <p className="text-[10px] tracking-[0.2em] text-white/40 uppercase">Now</p>
        {state?.text ? (
          <>
            <p className="mt-2 text-2xl leading-snug break-words">{state.text}</p>
            {state.label && <p className="mt-2 text-sm text-white/60">{state.label}</p>}
          </>
        ) : (
          <p className="mt-2 text-sm text-white/40">Nothing live yet.</p>
        )}
      </div>

      <div className="shrink-0 rounded border border-white/10 p-3">
        <p className="text-[10px] tracking-[0.2em] text-white/40 uppercase">Next</p>
        {state?.nextText ? (
          <>
            <p className="mt-1 line-clamp-2 text-base text-white/80">{state.nextText}</p>
            {state.nextLabel && <p className="mt-0.5 text-xs text-white/50">{state.nextLabel}</p>}
          </>
        ) : (
          <p className="mt-1 text-sm text-white/40">End of outline.</p>
        )}
      </div>

      {state?.operatorMessage && (
        <div className="shrink-0 rounded border border-amber-400/40 bg-amber-400/10 p-3">
          <p className="text-[10px] tracking-[0.2em] text-amber-300/70 uppercase">Message</p>
          <p className="mt-1 text-lg text-amber-200">{state.operatorMessage}</p>
        </div>
      )}
    </div>
  );
}
