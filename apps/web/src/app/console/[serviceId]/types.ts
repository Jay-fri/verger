export type CueItem = {
  id: string;
  position: number;
  book: string;
  chapter: number;
  verse: number;
  label: string;
  text: string;
  translation: string;
};

export type LiveItem = {
  source: "cue" | "detection" | "search";
  book: string;
  chapter: number;
  verse: number;
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
