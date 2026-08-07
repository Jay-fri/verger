export type { CueItemType, CueItem } from "@/lib/services/types";
import type { CueItemType } from "@/lib/services/types";

export type LiveItem = {
  source: "cue" | "detection" | "search";
  type: CueItemType;
  label: string;
  text: string;
};

export type DetectedEntry = {
  id: string;
  status: "confident" | "needs-review" | "confirmed";
  book: string;
  chapter: number;
  verse: number;
  label: string;
  text: string;
  /** The transcript sentence that triggered this match, shown for operator context. */
  chunkText: string;
};
