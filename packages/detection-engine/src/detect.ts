import {
  findAllReferences,
  getVersesForReference,
  embedText,
  searchByEmbedding,
  DEFAULT_TRANSLATION,
  type ReferenceContext,
  type SemanticMatch,
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

function refLabel(book: string, chapter: number, verse?: number): string {
  return verse !== undefined ? `${book} ${chapter}:${verse}` : `${book} ${chapter}`;
}

function scopeLabel(scope?: { book: string; chapter?: number }): string {
  if (!scope) return "full Bible";
  return scope.chapter !== undefined ? `${scope.book} ${scope.chapter}` : `${scope.book} (whole book)`;
}

// Stopwatch helper purely for the per-stage [timing] log lines below — the
// ask behind these (see piloting feedback) is being able to see, from real
// service logs, exactly where time goes rather than guessing whether
// semantic search is running when it shouldn't be.
async function timed<T>(chunkId: string, label: string, fn: () => Promise<T>): Promise<T> {
  const t0 = performance.now();
  const result = await fn();
  console.info(`[timing] chunk ${chunkId}: ${label} took ${(performance.now() - t0).toFixed(1)}ms`);
  return result;
}

// Sync counterpart to `timed` — for findAllReferences, which is plain JS
// with no DB/network call and no reason to be async.
function timedSync<T>(chunkId: string, label: string, fn: () => T): T {
  const t0 = performance.now();
  const result = fn();
  console.info(`[timing] chunk ${chunkId}: ${label} took ${(performance.now() - t0).toFixed(1)}ms`);
  return result;
}

export type DetectChunkEventsResult = {
  events: DetectionEvent[];
  /** Updated book/chapter context — pass this into the next chunk's config.referenceContext. */
  context: ReferenceContext | null;
};

/**
 * Runs one transcript chunk through the Bible data layer and scores every
 * exact reference it contains — real speech routinely cites several
 * references in one breath ("turn to John 3:16, then flip over to Romans
 * 8:28"), and a single live-transcription chunk (an AssemblyAI "turn") can
 * easily span more than one, so this can't stop at the first. The exact
 * path is checked first and, when it finds at least one *specific-verse*
 * reference, is a hard early return — semantic search, which needs a local
 * embedding model call plus a DB round trip, never runs in that case, so a
 * citation like "John 3:16" never pays for both. See the `[timing]` log
 * lines this function emits for direct, per-chunk proof of this — each
 * stage (reference parsing, the exact-match DB lookup, the embedding call,
 * the semantic DB query) is timed and logged separately.
 *
 * A chapter-only or book-only reference ("2 Corinthians 6", or just "the
 * Romans") is different: on its own it's too vague to be more than a
 * fallback (see the isWholeChapter routing below), but real preaching often
 * pairs it with a paraphrase in the same breath ("...where Timothy
 * said..."). Rather than just returning the chapter's opening verse and
 * discarding the paraphrase, that partial reference is used to *scope* a
 * semantic search — restricting the ~31,000-verse table to just the named
 * chapter (or book) before ranking candidates, which both improves the odds
 * of finding the right verse (far less irrelevant competition) and reduces
 * false positives from elsewhere in the Bible. It's also, in practice,
 * dramatically cheaper: a scoped search hits the plain book/chapter index
 * and sorts a handful of rows (single-digit ms), while an unscoped search
 * falls back to the approximate HNSW vector index over the whole table
 * (real measurement: ~150-900ms depending on how warm that index's pages
 * are in the database's cache — see the README's "Why non-scripture text
 * still costs real time" note). If the scoped search finds something that
 * clears the similarity floor, it's used in place of the generic
 * chapter-opening fallback; if not, that fallback is still what gets
 * returned — the operator gets *something* usable (the chapter's start,
 * plus Phase 6.5's verse navigation to move to the right verse by hand)
 * rather than nothing at all.
 *
 * Returns [] when the chunk doesn't look like scripture at all (ordinary
 * sermon speech — greetings, announcements, transitions — is the common
 * case, not the exception, so this needs to be a real "no event" outcome
 * rather than a low-confidence guess every single time).
 *
 * Logs a rejection line (console.info, server-side only — this never
 * reaches the browser or any UI) for every candidate that didn't end up
 * live: a parsed reference that resolved to zero verses, a semantic
 * candidate below the similarity floor, an alternative that lost to a
 * better candidate, or a best candidate that didn't clear the auto-display
 * threshold. This is deliberately verbose — the ask behind it is being able
 * to look back at real service logs afterward and tune thresholds from what
 * actually almost-matched, not guess.
 */
export async function detectChunkEvents(
  chunk: TranscriptChunk,
  config: DetectionEngineConfig,
): Promise<DetectChunkEventsResult> {
  const startedAt = Date.now();
  const translation = config.translation ?? DEFAULT_TRANSLATION;
  const outline = config.outline ?? [];
  const minSimilarity = config.minSemanticSimilarity ?? DEFAULT_MIN_SEMANTIC_SIMILARITY;
  const outlineBoost = config.outlineBoost ?? DEFAULT_OUTLINE_BOOST;
  const candidateLimit = config.semanticCandidates ?? DEFAULT_SEMANTIC_CANDIDATES;

  console.info(`[detection] chunk ${chunk.id}: match-start "${chunk.text.slice(0, 100)}"`);

  // Runs the semantic path (optionally book/chapter-scoped) and turns the
  // result into a single DetectionEvent, or null if nothing clears the
  // similarity floor. Shared by the plain full-Bible fallback at the bottom
  // of this function and the chapter/book-scoped narrowing above it. Embeds
  // and queries as two separately-timed stages (see the module-level
  // `timed` helper) rather than calling semanticSearch() as one opaque
  // step, specifically so the [timing] logs can show which half of
  // "semantic search" the time actually goes to.
  async function runSemanticSearch(scope?: { book: string; chapter?: number }): Promise<DetectionEvent | null> {
    const label = scopeLabel(scope);
    const queryVector = await timed(chunk.id, `embed query (scope: ${label})`, () => embedText(chunk.text));
    const candidates = await timed(chunk.id, `semantic DB query (scope: ${label})`, () =>
      searchByEmbedding(queryVector, { translation, limit: candidateLimit, scope }),
    );

    const plausible: SemanticMatch[] = [];
    for (const c of candidates) {
      if (c.similarity >= minSimilarity) {
        plausible.push(c);
      } else {
        console.info(
          `[detection] chunk ${chunk.id}: rejected — ${refLabel(c.book, c.chapter, c.verse)} ` +
            `similarity ${c.similarity.toFixed(3)} below floor ${minSimilarity} (scope: ${label})`,
        );
      }
    }
    if (plausible.length === 0) return null;

    const scored: DetectionCandidate[] = plausible
      .map((c) => {
        const inOutline = isInOutline(c, outline);
        return {
          verses: [{ translation: c.translation, book: c.book, chapter: c.chapter, verse: c.verse, text: c.text }],
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
    const decision = routeByConfidence(best.confidence, config.autoDisplayThreshold);

    for (const alt of alternatives) {
      const v = alt.verses[0];
      console.info(
        `[detection] chunk ${chunk.id}: rejected — ${refLabel(v.book, v.chapter, v.verse)} ` +
          `confidence ${alt.confidence.toFixed(3)} (raw ${alt.rawSimilarity?.toFixed(3)}) lost to a better candidate (scope: ${label})`,
      );
    }
    if (decision === "needs-review") {
      const v = best.verses[0];
      console.info(
        `[detection] chunk ${chunk.id}: best candidate ${refLabel(v.book, v.chapter, v.verse)} ` +
          `confidence ${best.confidence.toFixed(3)} below auto-display threshold ${config.autoDisplayThreshold} — needs-review (scope: ${label})`,
      );
    }

    const bestV = best.verses[0];
    console.info(
      `[detection] chunk ${chunk.id}: semantic best (scope: ${label}) ` +
        `${refLabel(bestV.book, bestV.chapter, bestV.verse)} confidence=${best.confidence.toFixed(3)} (${decision})`,
    );

    return { chunk, method: "semantic", best, alternatives, decision };
  }

  // Exact path: every literal reference in the chunk, possibly embedded in
  // a longer sentence ("Turn with me to John chapter 3, verse 16") rather
  // than typed bare, in the order they were spoken. Pure JS, no DB/network
  // call — timed anyway so the logs can prove it's not where the time goes.
  const { refs, context } = timedSync(chunk.id, "reference parsing (no DB)", () =>
    findAllReferences(chunk.text, config.referenceContext),
  );

  const chapterOnlyFallbacks: DetectionEvent[] = [];

  if (refs.length > 0) {
    const events: DetectionEvent[] = [];

    for (const ref of refs) {
      const exactVerses = await timed(chunk.id, `exact-match DB lookup (${refLabel(ref.book, ref.chapter, ref.verseStart)})`, () =>
        getVersesForReference(ref, translation),
      );
      // Parsed as a reference but matched nothing real (e.g. a chapter/verse
      // that doesn't exist) — skip just this one rather than the whole
      // chunk; the other references spoken alongside it are still real.
      if (exactVerses.length === 0) {
        console.info(
          `[detection] chunk ${chunk.id}: rejected — ${refLabel(ref.book, ref.chapter, ref.verseStart)} ` +
            `parsed but resolved to 0 verses (out-of-range reference)`,
        );
        continue;
      }

      const best: DetectionCandidate = {
        verses: exactVerses,
        confidence: 1,
        inOutline: exactVerses.some((v) => isInOutline(v, outline)),
      };

      if (ref.isWholeChapter) {
        // A bare chapter mention with no verse always routes to
        // needs-review regardless of its confidence=1 — auto-displaying a
        // guessed verse 1 the instant a chapter is named is wrong when
        // (the common case) a specific verse is about to be stated next.
        // Held separately rather than pushed straight into `events`: if
        // this chunk also has descriptive/paraphrased content, the scoped
        // semantic search below gets a chance to find something more
        // specific first — this is only the fallback if that comes up
        // empty.
        chapterOnlyFallbacks.push({ chunk, method: "exact", best, alternatives: [], decision: "needs-review" });
      } else {
        events.push({
          chunk,
          method: "exact",
          best,
          alternatives: [],
          decision: routeByConfidence(best.confidence, config.autoDisplayThreshold),
        });
      }
    }

    if (events.length > 0) {
      // At least one specific-verse reference — complete and authoritative
      // on its own, same as always. Any chapter-only mentions alongside it
      // in the same chunk are superseded, not also returned. Semantic
      // search never runs at all on this path — no [timing] lines for it
      // below, which is itself the proof it was skipped.
      const summary = events
        .map((e) => `${refLabel(e.best.verses[0].book, e.best.verses[0].chapter, e.best.verses[0].verse)} (${e.decision})`)
        .join(", ");
      console.info(`[detection] chunk ${chunk.id}: match-done in ${Date.now() - startedAt}ms — ${events.length} exact match(es): ${summary}`);
      return { events, context };
    }
    // Every parsed reference was either whole-chapter-only (handled below)
    // or matched zero rows — nothing to return from the exact path alone.
  }

  // Semantic path — scoped to the most specific book/chapter this session
  // currently knows about (from a reference in this same chunk, or carried
  // forward from a recent one), falling back to an unscoped full-Bible
  // search when nothing is known. Scoping doesn't change any verse's own
  // similarity score; it changes which verses are even in the running,
  // which is what actually improves the odds of finding the right one.
  const scope = context ? { book: context.book, chapter: context.chapter ?? undefined } : undefined;
  const scoped = await runSemanticSearch(scope);

  if (scoped) {
    console.info(
      `[detection] chunk ${chunk.id}: match-done in ${Date.now() - startedAt}ms — ` +
        `semantic match found (scope: ${scopeLabel(scope)})`,
    );
    return { events: [scoped], context };
  }

  if (chapterOnlyFallbacks.length > 0) {
    console.info(
      `[detection] chunk ${chunk.id}: match-done in ${Date.now() - startedAt}ms — ` +
        `no scoped semantic match (scope: ${scopeLabel(scope)}), falling back to chapter-opening entry`,
    );
    return { events: chapterOnlyFallbacks, context };
  }

  console.info(
    `[detection] chunk ${chunk.id}: match-done in ${Date.now() - startedAt}ms — ` +
      `no plausible match (scope: ${scopeLabel(scope)})`,
  );
  return { events: [], context };
}

/**
 * Single-match convenience wrapper over detectChunkEvents, kept for callers
 * that only ever expect one match per chunk (this package's own tests,
 * demo.ts). Returns the first (leftmost) event, same as this function's
 * original single-match behavior before detectChunkEvents existed.
 */
export async function detectChunk(
  chunk: TranscriptChunk,
  config: DetectionEngineConfig,
): Promise<DetectionEvent | null> {
  const { events } = await detectChunkEvents(chunk, config);
  return events[0] ?? null;
}
