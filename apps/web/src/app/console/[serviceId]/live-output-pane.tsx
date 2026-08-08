import type { ReactNode } from "react";
import { CueTypeBadge } from "@/components/cue-type-badge";
import type { CueItem, LiveItem, LiveStateMode } from "./types";

const SOURCE_LABEL: Record<LiveItem["source"], string> = {
  cue: "Order of service",
  detection: "AI detected",
  search: "Manual search",
  quick: "Quick insert",
};

const PANIC_LABEL: Record<Exclude<LiveStateMode, "content">, string> = {
  clear: "Cleared",
  black: "Black",
  logo: "Showing logo",
};

export function LiveOutputPane({
  current,
  next,
  activeCue,
  onResumeActiveCue,
  onNavigateVerse,
  navPending,
  onPanic,
  operatorMessage,
  onOperatorMessageChange,
  onSendOperatorMessage,
  onClearOperatorMessage,
  children,
}: {
  current: LiveItem | null;
  next: CueItem | null;
  activeCue: CueItem | null;
  onResumeActiveCue: () => void;
  onNavigateVerse: (direction: "next" | "prev") => void;
  navPending: boolean;
  onPanic: (mode: Exclude<LiveStateMode, "content">) => void;
  operatorMessage: string;
  onOperatorMessageChange: (value: string) => void;
  onSendOperatorMessage: () => void;
  onClearOperatorMessage: () => void;
  children?: ReactNode;
}) {
  // The cue list stays highlighted on activeCue regardless of what's live
  // (quick-insert pushes never touch it) — this strip surfaces that so the
  // operator can tell at a glance they've gone off-script and get back with
  // one click, without having to go hunt for the still-highlighted cue.
  const isPausedOnCue = activeCue && current?.source !== "cue";
  const panicMode = current?.mode && current.mode !== "content" ? current.mode : null;

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <div className="flex items-center justify-between border-b border-border p-4">
        <h2 className="text-sm font-medium tracking-wide text-accent-gold uppercase">
          Live output
        </h2>
        <div className="flex items-center gap-2">
          {/* Always visible, one click, take effect on the Stage output
              immediately (bypassing the minimum-display-time debounce) —
              an emergency override, not a normal content change. See
              pushPanicMode in control-console.tsx. */}
          <button
            type="button"
            onClick={() => onPanic("clear")}
            title="Blank the text on Stage output"
            className="rounded-lg border border-border px-2.5 py-1 text-xs font-medium text-text-primary hover:bg-background"
          >
            Clear
          </button>
          <button
            type="button"
            onClick={() => onPanic("black")}
            title="Full black screen on Stage output"
            className="rounded-lg border border-border px-2.5 py-1 text-xs font-medium text-text-primary hover:bg-background"
          >
            Black
          </button>
          <button
            type="button"
            onClick={() => onPanic("logo")}
            title="Show the church logo on Stage output"
            className="rounded-lg border border-border px-2.5 py-1 text-xs font-medium text-text-primary hover:bg-background"
          >
            Logo
          </button>
          {current && (
            <span className="bg-live/15 text-live flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium">
              <span className="bg-live h-1.5 w-1.5 rounded-full" />
              On air
            </span>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-4 border-b border-border p-6">
        <div className="flex flex-col justify-center rounded-xl border border-border bg-background p-8 text-center">
          {panicMode ? (
            <>
              <p className="text-xs font-medium tracking-wide text-needs-review uppercase">
                Panic mode active
              </p>
              <p className="mt-3 text-xl font-medium text-text-primary">{PANIC_LABEL[panicMode]}</p>
              <p className="mt-2 text-xs text-text-secondary">
                Stage output is showing this instead of normal content. Pick a cue, search result, or
                quick-insert item to resume.
              </p>
            </>
          ) : current ? (
            <>
              <div className="flex items-center justify-center gap-2">
                <CueTypeBadge type={current.type} />
                <p className="text-xs font-medium tracking-wide text-text-secondary uppercase">
                  {SOURCE_LABEL[current.source]}
                </p>
              </div>
              <p className="mt-3 text-xl leading-relaxed text-text-primary sm:text-2xl">
                &ldquo;{current.text}&rdquo;
              </p>
              <p className="mt-4 text-sm font-medium text-accent-gold">{current.label}</p>

              {current.reference && (
                <div className="mt-5 flex items-center justify-center gap-3 border-t border-border pt-4">
                  <button
                    type="button"
                    disabled={navPending}
                    onClick={() => onNavigateVerse("prev")}
                    className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-text-primary hover:bg-surface disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    ← Previous verse
                  </button>
                  <button
                    type="button"
                    disabled={navPending}
                    onClick={() => onNavigateVerse("next")}
                    className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-text-primary hover:bg-surface disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Next verse →
                  </button>
                </div>
              )}
            </>
          ) : (
            <p className="text-sm text-text-secondary">Nothing live yet.</p>
          )}
        </div>

        {isPausedOnCue && (
          <div className="border-accent-gold/40 bg-accent-gold/10 flex items-center justify-between gap-3 rounded-xl border p-3">
            <div className="min-w-0">
              <p className="text-xs font-medium tracking-wide text-text-secondary uppercase">
                Order of service paused at
              </p>
              <p className="mt-0.5 truncate text-sm text-text-primary">{activeCue.label}</p>
            </div>
            <button
              type="button"
              onClick={onResumeActiveCue}
              className="shrink-0 rounded-lg bg-accent-gold px-3 py-1.5 text-xs font-medium text-background hover:opacity-90"
            >
              Resume
            </button>
          </div>
        )}

        <div className="rounded-xl border border-border bg-surface p-4">
          <div className="flex items-center gap-1.5">
            <p className="text-xs font-medium tracking-wide text-text-secondary uppercase">Next</p>
            {next && <CueTypeBadge type={next.type} />}
          </div>
          {next ? (
            <>
              <p className="mt-1 line-clamp-1 text-sm text-text-primary">{next.text}</p>
              <p className="mt-0.5 text-xs text-accent-gold">{next.label}</p>
            </>
          ) : (
            <p className="mt-1 text-sm text-text-secondary">End of outline.</p>
          )}
        </div>

        <div className="rounded-xl border border-border bg-surface p-4">
          <p className="text-xs font-medium tracking-wide text-text-secondary uppercase">
            Message to confidence monitor
          </p>
          <p className="mt-0.5 text-xs text-text-secondary">
            Shown only on the pastor/band-facing monitor — never the audience Stage output.
          </p>
          <div className="mt-2 flex gap-2">
            <input
              type="text"
              value={operatorMessage}
              onChange={(e) => onOperatorMessageChange(e.target.value)}
              placeholder="e.g. Running 3 minutes long"
              className="w-full rounded-lg border border-border bg-background px-3 py-1.5 text-sm text-text-primary placeholder:text-text-secondary focus:border-accent-gold focus:ring-1 focus:ring-accent-gold focus:outline-none"
            />
            <button
              type="button"
              onClick={onSendOperatorMessage}
              className="shrink-0 rounded-lg bg-accent-gold px-3 py-1.5 text-xs font-medium text-background hover:opacity-90"
            >
              Send
            </button>
            <button
              type="button"
              onClick={onClearOperatorMessage}
              className="shrink-0 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-text-secondary hover:bg-background"
            >
              Clear
            </button>
          </div>
        </div>
      </div>

      {children}
    </div>
  );
}
