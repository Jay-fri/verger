import { IconCheck, IconPlayerPause, IconSparkles } from "@tabler/icons-react";
import type { DetectedEntry } from "./types";

// Confidence is communicated by color alone — sage for confident, terracotta
// for needs-review — never a raw percentage, per the design direction doc.
// Keyed by `confidence`, not `action`: the dot always reflects the real
// detection confidence, permanently, regardless of what the operator later
// does with the entry.
const CONFIDENCE_STYLES: Record<DetectedEntry["confidence"], string> = {
  confident: "border-confident/40 bg-confident/10",
  "needs-review": "border-needs-review/40 bg-needs-review/10",
};

const CONFIDENCE_DOT: Record<DetectedEntry["confidence"], string> = {
  confident: "bg-confident",
  "needs-review": "bg-needs-review",
};

/**
 * The right-hand column in Live mode. Collapses to a slim strip when there's
 * nothing to show yet and expands to full width the moment a match arrives
 * — width itself is driven by the parent's grid template (see
 * service-screen.tsx), this just renders the two states.
 *
 * Every entry — pending, confirmed, or dismissed — stays in the list and
 * stays clickable for the whole session, most recent at top (see
 * service-screen.tsx's recordMatch, which prepends). Tapping any entry
 * re-pushes it live and marks it confirmed, the same action as confirming a
 * fresh detection; already-acted entries are just visually dimmed, not
 * removed.
 */
export function AiDetectedPane({
  entries,
  currentChunkText,
  onSelect,
  onDismiss,
  collapsed,
  detectionPaused,
}: {
  entries: DetectedEntry[];
  currentChunkText: string | null;
  onSelect: (entryId: string) => void;
  onDismiss: (entryId: string) => void;
  collapsed: boolean;
  /** Mirrors service-screen.tsx's detection-pause toggle — see its doc comment. Purely a visual reinforcement here; the header toggle is what actually stops detection. */
  detectionPaused: boolean;
}) {
  if (collapsed) {
    return (
      <div className="flex h-full flex-col items-center gap-2 py-4 text-text-secondary">
        {detectionPaused ? (
          <IconPlayerPause size={16} stroke={1.75} className="text-danger" aria-hidden="true" />
        ) : (
          <IconSparkles size={16} stroke={1.75} aria-hidden="true" />
        )}
        <p className="[writing-mode:vertical-rl] text-xs font-medium tracking-wide uppercase">
          {detectionPaused ? "Paused" : "AI detected"}
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-border p-4">
        <h2 className="text-sm font-medium tracking-wide text-accent-gold uppercase">AI detected</h2>
      </div>

      {detectionPaused && (
        <div className="border-danger/40 bg-danger/15 flex shrink-0 items-center gap-2 border-b px-4 py-2.5">
          <IconPlayerPause size={14} stroke={2} className="text-danger shrink-0" aria-hidden="true" />
          <p className="text-danger text-xs font-semibold">Detection paused — no new matches until resumed</p>
        </div>
      )}

      {currentChunkText && (
        <div className="flex items-center gap-2 border-b border-border bg-background px-4 py-2">
          <span className="bg-accent-gold h-1.5 w-1.5 shrink-0 animate-pulse rounded-full" />
          <p className="line-clamp-1 text-xs text-text-secondary italic">&ldquo;{currentChunkText}&rdquo;</p>
        </div>
      )}

      <div className="flex-1 space-y-2 overflow-y-auto p-3">
        {entries.map((entry) => {
          const isHistory = entry.action !== "pending";
          return (
            <div key={entry.id} className={`rounded-lg border ${CONFIDENCE_STYLES[entry.confidence]}`}>
              {/* The whole row is the "push live again" action — every
                  entry, regardless of action state, stays clickable for the
                  rest of the session. Dismiss (below, pending-only) is a
                  sibling, not nested inside this, so the two click targets
                  never conflict. */}
              <div
                role="button"
                tabIndex={0}
                onClick={() => onSelect(entry.id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onSelect(entry.id);
                  }
                }}
                className={`flex cursor-pointer items-start gap-2 rounded-lg p-3 transition-opacity hover:opacity-100 ${
                  isHistory ? "opacity-55" : ""
                }`}
              >
                <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${CONFIDENCE_DOT[entry.confidence]}`} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <p className="truncate text-sm font-medium text-text-primary">{entry.label}</p>
                    {entry.action === "confirmed" && (
                      <span className="text-confident flex shrink-0 items-center gap-0.5 text-[10px] font-medium uppercase tracking-wide">
                        <IconCheck size={11} stroke={2.5} aria-hidden="true" />
                        {entry.autoDisplayed ? "Auto" : "Confirmed"}
                      </span>
                    )}
                    {entry.action === "dismissed" && (
                      <span className="text-text-secondary shrink-0 text-[10px] font-medium uppercase tracking-wide">
                        Dismissed
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 line-clamp-2 text-xs text-text-secondary">{entry.text}</p>
                </div>
              </div>

              {entry.action === "pending" && (
                <div className="px-3 pb-3">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDismiss(entry.id);
                    }}
                    className="rounded-lg border border-border px-3 py-1 text-xs font-medium text-text-secondary hover:bg-background"
                  >
                    Dismiss
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
