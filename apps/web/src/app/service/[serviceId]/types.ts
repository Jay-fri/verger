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
  // Purely about detection confidence — drives the sage/terracotta dot
  // color, permanently, regardless of what the operator later does with the
  // entry. Deliberately kept separate from `action` below: confidence is a
  // fact about the detection, action is what happened to it since.
  confidence: "confident" | "needs-review";
  // What's happened to this entry since it was detected — persists for the
  // whole session (the AI Detected panel keeps every entry visible, never
  // removes one). "pending": still needs a tap. "confirmed": pushed live,
  // either by auto-display or an operator tap. "dismissed": operator
  // declined it. Every entry stays clickable regardless of `action` —
  // tapping any of them (pending, confirmed, or dismissed) re-pushes it live
  // and sets `action` to "confirmed", the same as confirming a fresh one.
  action: "pending" | "confirmed" | "dismissed";
  // True only if this entry was actually auto-pushed to the live output at
  // the moment it was detected (Auto mode, confident, not suppressed by the
  // debounce). Kept separate from `action` so the "Auto-displayed" history
  // label stays accurate even after a later manual re-tap re-confirms it.
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
