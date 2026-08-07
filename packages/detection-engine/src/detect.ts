import {
  findReference,
  getVersesForReference,
  semanticSearch,
  DEFAULT_TRANSLATION,
} from "@verger/bible-data";
import { isInOutline, boostedConfidence } from "./confidence";
import { routeByConfidence } from "./router";
import {
  DEFAULT_MIN_SEMANTIC_SIMILARITY,
  DEFAULT_OUTLINE_BOOST,
  DEFAULT_SEMANTIC_CANDIDATES,
  type DetectionCandidate,
  type DetectionEngineConfig,
  type DetectionEvent,
  type TranscriptChunk,
} from "./types";

/**
 * Runs one transcript chunk through the Bible data layer and scores the
 * result. Returns null when the chunk doesn't look like scripture at all
 * (ordinary sermon speech — greetings, announcements, transitions — is the
 * common case, not the exception, so this needs to be a real "no event"
 * outcome rather than a low-confidence guess every single time).
 */
export async function detectChunk(
  chunk: TranscriptChunk,
  config: DetectionEngineConfig,
): Promise<DetectionEvent | null> {
  const translation = config.translation ?? DEFAULT_TRANSLATION;
  const outline = config.outline ?? [];
  const minSimilarity = config.minSemanticSimilarity ?? DEFAULT_MIN_SEMANTIC_SIMILARITY;
  const outlineBoost = config.outlineBoost ?? DEFAULT_OUTLINE_BOOST;
  const candidateLimit = config.semanticCandidates ?? DEFAULT_SEMANTIC_CANDIDATES;

  // Exact path: a literal reference, possibly embedded in a longer sentence
  // ("Turn with me to John chapter 3, verse 16") rather than typed bare.
  const ref = findReference(chunk.text);
  if (ref) {
    const exactVerses = await getVersesForReference(ref, translation);
    if (exactVerses.length > 0) {
      const best: DetectionCandidate = {
        verses: exactVerses,
        confidence: 1,
        inOutline: exactVerses.some((v) => isInOutline(v, outline)),
      };
      return {
        chunk,
        method: "exact",
        best,
        alternatives: [],
        decision: routeByConfidence(best.confidence, config.autoDisplayThreshold),
      };
    }
    // Parsed as a reference but matched nothing real (e.g. a chapter/verse
    // that doesn't exist) — fall through to semantic search on the raw
    // text, same documented behavior as bible-data's resolveScripture().
  }

  // Semantic path. Filter to plausible candidates *before* outline
  // boosting/re-ranking — the outline should disambiguate among verses
  // that are already a plausible match, not rescue an implausible one.
  const candidates = await semanticSearch(chunk.text, { translation, limit: candidateLimit });
  const plausible = candidates.filter((c) => c.similarity >= minSimilarity);
  if (plausible.length === 0) {
    return null;
  }

  const scored: DetectionCandidate[] = plausible
    .map((c) => {
      const inOutline = isInOutline(c, outline);
      return {
        verses: [
          {
            translation: c.translation,
            book: c.book,
            chapter: c.chapter,
            verse: c.verse,
            text: c.text,
          },
        ],
        confidence: boostedConfidence(c.similarity, inOutline, outlineBoost),
        rawSimilarity: c.similarity,
        inOutline,
      };
    })
    // Re-rank by boosted confidence, not raw similarity — an outline match
    // that wasn't the raw top candidate can become the best one after
    // boosting.
    .sort((a, b) => b.confidence - a.confidence);

  const [best, ...alternatives] = scored;

  return {
    chunk,
    method: "semantic",
    best,
    alternatives,
    decision: routeByConfidence(best.confidence, config.autoDisplayThreshold),
  };
}
