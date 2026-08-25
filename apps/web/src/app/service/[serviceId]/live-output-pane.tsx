"use client";

import { useEffect, useRef, useState } from "react";
import { IconEraser, IconMessage, IconPhoto, IconSquareFilled } from "@tabler/icons-react";
import { CueTypeBadge } from "@/components/cue-type-badge";
import type { LiveItem, LiveStateMode } from "./types";

const SOURCE_LABEL: Record<LiveItem["source"], string> = {
  cue: "Order of service",
  detection: "AI detected",
  search: "Search",
  quick: "Quick insert",
};

const PANIC_LABEL: Record<Exclude<LiveStateMode, "content">, string> = {
  clear: "Cleared",
  black: "Black",
  logo: "Showing logo",
};

/**
 * The top of the middle column in Live mode — given a fixed-height wrapper
 * by service-screen.tsx (Order of Service sits below it in the same
 * column), so it never shrinks or resizes as a side effect of that list's
 * length. Header and panic controls stay fixed; only the current/next
 * content scrolls internally if it ever needs to.
 */
export function LiveOutputPane({
  current,
  next,
  onNavigateVerse,
  navPending,
  onPanic,
  operatorMessage,
  onOperatorMessageChange,
  onSendOperatorMessage,
  onClearOperatorMessage,
}: {
  current: LiveItem | null;
  next: { label: string; text: string; type: LiveItem["type"] } | null;
  onNavigateVerse: (direction: "next" | "prev") => void;
  navPending: boolean;
  onPanic: (mode: Exclude<LiveStateMode, "content">) => void;
  operatorMessage: string;
  onOperatorMessageChange: (value: string) => void;
  onSendOperatorMessage: () => void;
  onClearOperatorMessage: () => void;
}) {
  const [composerOpen, setComposerOpen] = useState(false);
  const composerRef = useRef<HTMLDivElement>(null);

  // Click-outside and Escape both cancel — same as they'd close any other
  // popover. The full-screen backdrop below is what actually catches the
  // click; this also covers Escape, which the backdrop can't.
  useEffect(() => {
    if (!composerOpen) return;
    function onClickOutside(e: MouseEvent) {
      if (composerRef.current && !composerRef.current.contains(e.target as Node)) {
        setComposerOpen(false);
      }
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setComposerOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onClickOutside);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [composerOpen]);

  const panicMode = current?.mode && current.mode !== "content" ? current.mode : null;
  const hasMessage = operatorMessage.trim().length > 0;

  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 items-center justify-between border-b border-border p-4">
        <h2 className="text-sm font-medium tracking-wide text-accent-gold uppercase">Live output</h2>
        <div className="flex items-center gap-2">
          {/* Was its own always-visible box below the content; now an
              expand-on-tap popover so this column stays compact — the
              backdrop blurs everything else so the operator's attention is
              on the message while it's open, and any click outside (or
              Escape, or Cancel) drops it without sending anything. */}
          <button
            type="button"
            onClick={() => setComposerOpen((v) => !v)}
            title="Message to confidence monitor"
            className={`relative flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors ${
              composerOpen
                ? "border-accent-gold bg-accent-gold/10 text-accent-gold"
                : "border-border text-text-secondary hover:bg-background hover:text-text-primary"
            }`}
          >
            <IconMessage size={14} stroke={1.75} aria-hidden="true" />
            Message
            {hasMessage && !composerOpen && (
              <span className="bg-accent-gold absolute -top-1 -right-1 h-2 w-2 rounded-full" aria-hidden="true" />
            )}
          </button>

          {/* Filled, danger-colored, visually distinct without reading the
              label — always available, always operator-initiated. Bypasses
              the minimum-display-time debounce entirely; see pushPanicMode
              in service-screen.tsx. */}
          <button
            type="button"
            onClick={() => onPanic("clear")}
            title="Blank the text on Stage output"
            className="bg-danger flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-white hover:opacity-90"
          >
            <IconEraser size={14} stroke={2} aria-hidden="true" />
            Clear
          </button>
          <button
            type="button"
            onClick={() => onPanic("black")}
            title="Full black screen on Stage output"
            className="bg-danger flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-white hover:opacity-90"
          >
            <IconSquareFilled size={14} aria-hidden="true" />
            Black
          </button>
          <button
            type="button"
            onClick={() => onPanic("logo")}
            title="Show the church logo on Stage output"
            className="bg-danger flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-white hover:opacity-90"
          >
            <IconPhoto size={14} stroke={2} aria-hidden="true" />
            Logo
          </button>
          {current && (
            <span className="bg-accent-gold/15 text-accent-gold flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium">
              <span className="bg-accent-gold h-1.5 w-1.5 rounded-full" />
              On air
            </span>
          )}
        </div>

        {composerOpen && (
          <>
            <div
              className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm"
              onClick={() => setComposerOpen(false)}
              aria-hidden="true"
            />
            {/* fixed, not absolute — this panel's ancestor (the sized
                Live-Output wrapper in service-screen.tsx) is overflow:
                hidden with a resizable, sometimes-short fixed height, which
                would clip an absolutely-positioned popover. fixed escapes
                that entirely instead of anchoring precisely under the
                button — the full-screen backdrop already draws the eye
                here regardless of exact position. */}
            <div
              ref={composerRef}
              className="border-border bg-surface fixed top-20 right-6 z-50 w-80 rounded-xl border p-4 shadow-xl"
            >
              <p className="text-xs font-medium tracking-wide text-text-secondary uppercase">Message to monitor</p>
              <p className="text-text-secondary mt-0.5 text-xs">
                Shown only on the confidence monitor — never the audience Stage output.
              </p>
              <input
                type="text"
                autoFocus
                value={operatorMessage}
                onChange={(e) => onOperatorMessageChange(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    onSendOperatorMessage();
                  }
                }}
                placeholder="e.g. Running 3 minutes long"
                className="border-border bg-background text-text-primary placeholder:text-text-secondary focus:border-accent-gold focus:ring-accent-gold mt-3 w-full rounded-lg border px-3 py-1.5 text-sm focus:ring-1 focus:outline-none"
              />
              <div className="mt-3 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setComposerOpen(false)}
                  className="text-text-secondary hover:bg-background rounded-lg border border-border px-3 py-1.5 text-xs font-medium"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={onClearOperatorMessage}
                  className="text-text-secondary hover:bg-background rounded-lg border border-border px-3 py-1.5 text-xs font-medium"
                >
                  Clear
                </button>
                <button
                  type="button"
                  onClick={onSendOperatorMessage}
                  className="bg-accent-gold text-accent-gold-ink rounded-lg px-3 py-1.5 text-xs font-medium hover:opacity-90"
                >
                  Send
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
        <div className="flex flex-col justify-center rounded-xl border border-border bg-background p-6 text-center">
          {panicMode ? (
            <>
              <p className="text-needs-review text-xs font-medium tracking-wide uppercase">Panic mode active</p>
              <p className="mt-3 text-lg font-medium text-text-primary">{PANIC_LABEL[panicMode]}</p>
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
              <p className="mt-3 text-lg leading-relaxed text-text-primary sm:text-xl">&ldquo;{current.text}&rdquo;</p>
              <p className="mt-3 text-sm font-medium text-accent-gold">{current.label}</p>

              {current.reference && (
                <div className="mt-4 flex items-center justify-center gap-3 border-t border-border pt-3">
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

        <div className="rounded-xl border border-border bg-surface p-3.5">
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
      </div>
    </div>
  );
}
