export type TranscriptChunk = {
  id: string;
  text: string;
  /** ms since session start, or a wall-clock timestamp — optional; useful once real STT timestamps exist. */
  timestamp?: number;
};

/** A verse from the session's Prep outline, per the overview doc's "Prep outline checked first" behavior. */
export type OutlineVerseRef = {
  book: string;
  chapter: number;
  verse: number;
};

export type DetectionMethod = "exact" | "semantic";
export type RouteDecision = "auto-display" | "needs-review";

export type MatchedVerse = {
  translation: string;
  book: string;
  chapter: number;
  verse: number;
  text: string;
};

export type DetectionCandidate = {
  /** Exact matches can span a range (e.g. "Jn 3:16-18"); semantic matches are always a single verse. */
  verses: MatchedVerse[];
  /** Final confidence used for routing — 1 for exact, similarity (+ outline boost) for semantic. */
  confidence: number;
  /** Present only for semantic candidates — the pre-boost cosine similarity. */
  rawSimilarity?: number;
  inOutline: boolean;
};

export type DetectionEvent = {
  chunk: TranscriptChunk;
  method: DetectionMethod;
  /** The candidate selected after outline-boosted re-ranking. */
  best: DetectionCandidate;
  /** Other semantic candidates considered for this chunk, most similar first — empty for exact matches. Kept for a future manual-override UI. */
  alternatives: DetectionCandidate[];
  decision: RouteDecision;
};

export type DetectionEngineConfig = {
  translation?: string;
  /** This session's Prep outline. Empty/omitted means no boosting — every semantic match is ranked on raw similarity alone. */
  outline?: OutlineVerseRef[];
  /**
   * Confidence >= this routes to "auto-display"; below it, "needs-review".
   * The single lever that differs between team mode (conservative, higher
   * threshold, human confirms) and a future solo mode (lower threshold,
   * fewer/no team members to catch a bad auto-display) — see the overview
   * doc's future-extensibility notes. Not defaulted silently: callers must
   * pick a value appropriate to their session.
   */
  autoDisplayThreshold: number;
  /**
   * Semantic candidates with raw similarity below this are treated as "not
   * scripture at all" and produce no event. Deliberately conservative
   * (0.5 default) rather than tuned to aggressively silence banter: real
   * paraphrases can score as low as ~0.6 (see packages/bible-data's fixture
   * tests), so a floor high enough to reliably filter greetings/announcements
   * would also start dropping genuine weak matches. The auto-display
   * threshold, not this floor, is what actually protects the screen —
   * ordinary sermon speech empirically tops out well below a reasonable
   * auto-display bar, so it lands in "needs review" (a harmless queue
   * entry an operator ignores) rather than never being caught at all.
   */
  minSemanticSimilarity?: number;
  /** Added to a semantic candidate's raw similarity when its verse is in the outline. */
  outlineBoost?: number;
  /** How many semantic candidates to fetch and consider (post outline-boost re-ranking) per chunk. */
  semanticCandidates?: number;
};

export const DEFAULT_MIN_SEMANTIC_SIMILARITY = 0.5;
export const DEFAULT_OUTLINE_BOOST = 0.15;
export const DEFAULT_SEMANTIC_CANDIDATES = 5;
