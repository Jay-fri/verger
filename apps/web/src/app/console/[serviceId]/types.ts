export type { CueItemType, CueItem } from "@/lib/services/types";
import type { CueItemType } from "@/lib/services/types";

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
};

export type DetectedEntry = {
  id: string;
  status: "confident" | "needs-review" | "confirmed";
  translation: string;
  book: string;
  chapter: number;
  verse: number;
  label: string;
  text: string;
  /** The transcript sentence that triggered this match, shown for operator context. */
  chunkText: string;
};
