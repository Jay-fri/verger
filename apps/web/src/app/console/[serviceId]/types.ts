export type { CueItemType, CueItem } from "@/lib/services/types";
import type { CueItemType } from "@/lib/services/types";
export type { CueSection } from "@/lib/services/cue-sections";
export type { LiveStateMode } from "@/lib/services/live-state";
import type { LiveStateMode } from "@/lib/services/live-state";

export type VerseReference = {
  translation: string;
  book: string;
  chapter: number;
  verse: number;
};

export type LiveItem = {
  source: "cue" | "detection" | "search" | "quick";
  type: CueItemType;
  label: string;
  text: string;
  // Populated only when type === "verse" — what makes Previous/Next verse
  // navigation possible regardless of how the verse got pushed live.
  reference: VerseReference | null;
  // "content" (the default/implied state whenever this field is absent) or
  // one of the three panic-button overrides — see LiveOutputPane's panic
  // buttons and pushPanicMode in control-console.tsx. Purely a client-side
  // rendering concern for the operator's own Live output pane; the
  // authoritative value lives in live_state.mode server-side.
  mode?: LiveStateMode;
};

export type DetectedEntry = {
  id: string;
  // "confident"/"needs-review" is purely about confidence (drives the
  // sage/terracotta coloring — always shown, in both Auto and Manual mode,
  // since it's informational either way). Whether this entry actually made
  // it to the live output automatically is a SEPARATE question — see
  // autoDisplayed below — because a confident match can still be sitting
  // here unconfirmed, either because the session is in Manual mode or
  // because the minimum-display-time debounce held it back.
  status: "confident" | "needs-review" | "confirmed";
  // True only when this entry was actually auto-pushed to the live output
  // (Auto mode, confident, and not suppressed by the debounce). Confirm/
  // Dismiss buttons show whenever this is false and status isn't
  // "confirmed" yet — i.e. the operator still has to act on it, regardless
  // of why it didn't auto-display.
  autoDisplayed: boolean;
  translation: string;
  book: string;
  chapter: number;
  verse: number;
  label: string;
  text: string;
  /** The transcript sentence that triggered this match, shown for operator context. */
  chunkText: string;
};
