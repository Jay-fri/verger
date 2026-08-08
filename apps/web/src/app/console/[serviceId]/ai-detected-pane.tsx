import { VerseSearch } from "@/components/verse-search";
import type { VerseSearchResult } from "@/lib/services/search";
import type { DetectedEntry } from "./types";

// Confidence state is communicated by color alone — sage for confident,
// terracotta for needs-review — never a raw percentage, per the design
// direction doc.
const STATUS_STYLES: Record<DetectedEntry["status"], string> = {
  confident: "border-confident/40 bg-confident/10",
  confirmed: "border-confident/40 bg-confident/10",
  "needs-review": "border-needs-review/40 bg-needs-review/10",
};

const STATUS_DOT: Record<DetectedEntry["status"], string> = {
  confident: "bg-confident",
  confirmed: "bg-confident",
  "needs-review": "bg-needs-review",
};

export function AiDetectedPane({
  entries,
  currentChunkText,
  onConfirm,
  onDismiss,
  onManualSelect,
}: {
  entries: DetectedEntry[];
  currentChunkText: string | null;
  onConfirm: (entryId: string) => void;
  onDismiss: (entryId: string) => void;
  onManualSelect: (verse: VerseSearchResult) => void;
}) {
  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-border p-4">
        <h2 className="text-sm font-medium tracking-wide text-accent-gold uppercase">
          AI detected
        </h2>
      </div>

      <div className="border-b border-border p-4">
        <VerseSearch onSelect={onManualSelect} selectLabel="Push live" placeholder="Manual search…" />
      </div>

      {currentChunkText && (
        <div className="flex items-center gap-2 border-b border-border bg-background px-4 py-2">
          <span className="bg-accent-gold h-1.5 w-1.5 shrink-0 animate-pulse rounded-full" />
          <p className="line-clamp-1 text-xs text-text-secondary italic">
            &ldquo;{currentChunkText}&rdquo;
          </p>
        </div>
      )}

      <div className="flex-1 space-y-2 overflow-y-auto p-3">
        {entries.length === 0 ? (
          <p className="p-3 text-sm text-text-secondary">
            No detections yet — start the mock session to see live matches appear here.
          </p>
        ) : (
          entries.map((entry) => (
            <div key={entry.id} className={`rounded-lg border p-3 ${STATUS_STYLES[entry.status]}`}>
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-start gap-2 min-w-0">
                  <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${STATUS_DOT[entry.status]}`} />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-text-primary">{entry.label}</p>
                    <p className="mt-0.5 line-clamp-2 text-xs text-text-secondary">{entry.text}</p>
                  </div>
                </div>
              </div>

              {entry.status === "confirmed" ? (
                <p className="text-confident mt-2 text-xs font-medium">Confirmed — on screen</p>
              ) : entry.autoDisplayed ? (
                <p className="text-confident mt-2 text-xs font-medium">Auto-displayed</p>
              ) : (
                // Needs a tap regardless of confidence tier — either it's a
                // real needs-review match, or it's confident but didn't
                // auto-push (Manual mode, or the minimum-display-time
                // debounce held it back — see recordMatch's doc comment in
                // control-console.tsx). Confirm always overrides
                // immediately, debounce or no.
                <div className="mt-2 flex gap-2">
                  <button
                    type="button"
                    onClick={() => onConfirm(entry.id)}
                    className="rounded-lg bg-accent-gold px-3 py-1 text-xs font-medium text-background hover:opacity-90"
                  >
                    Confirm
                  </button>
                  <button
                    type="button"
                    onClick={() => onDismiss(entry.id)}
                    className="rounded-lg border border-border px-3 py-1 text-xs font-medium text-text-secondary hover:bg-background"
                  >
                    Dismiss
                  </button>
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
