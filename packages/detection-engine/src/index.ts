export {
  type TranscriptChunk,
  type OutlineVerseRef,
  type DetectionMethod,
  type RouteDecision,
  type MatchedVerse,
  type DetectionCandidate,
  type DetectionEvent,
  type DetectionEngineConfig,
  DEFAULT_MIN_SEMANTIC_SIMILARITY,
  DEFAULT_OUTLINE_BOOST,
  DEFAULT_SEMANTIC_CANDIDATES,
} from "./types";
export { isInOutline, boostedConfidence } from "./confidence";
export { routeByConfidence } from "./router";
export { detectChunk } from "./detect";
export { detectFromTranscript } from "./stream";
export { MOCK_SERMON_TRANSCRIPT, MOCK_SERMON_OUTLINE } from "./mock-transcript";
