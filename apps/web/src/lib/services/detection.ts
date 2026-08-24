"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import {
  detectChunkEvents,
  MOCK_SERMON_TRANSCRIPT,
  type DetectionEngineConfig,
  type OutlineVerseRef,
} from "@verger/detection-engine";
import {
  embedText,
  getBook,
  getVersesForReference,
  DEFAULT_TRANSLATION,
  type ReferenceContext,
} from "@verger/bible-data";
import { db } from "@/lib/db";
import { cueItems, services } from "@/lib/db/schema";
import { requireServiceAccess } from "./access";

// Team-mode-shaped: conservative, since a human operator is watching the
// queue. A future solo mode would only need to lower this one number.
const AUTO_DISPLAY_THRESHOLD = 0.75;

// Real finding from profiling a live session: every chunk was re-querying
// the outline from scratch, paying a full DB round trip (~150-300ms in
// testing) even though the Prep outline essentially never changes mid-
// service. Cached per service, in-process, with a short TTL — long enough
// to skip that round trip on every one of a session's many chunks, short
// enough that an operator editing the outline in another tab mid-service
// (unusual, but possible) isn't stale for long. Module-level, so it only
// helps within one long-lived server process (local dev, or a warm
// serverless instance) — a cold instance just pays the query once, same as
// before this cache existed.
const OUTLINE_CACHE_TTL_MS = 30_000;
const outlineCache = new Map<string, { outline: OutlineVerseRef[]; cachedAt: number }>();

async function getCachedOutline(serviceId: string): Promise<OutlineVerseRef[]> {
  const cached = outlineCache.get(serviceId);
  if (cached && Date.now() - cached.cachedAt < OUTLINE_CACHE_TTL_MS) {
    return cached.outline;
  }

  if (!db) throw new Error("Database is not configured.");
  const t0 = performance.now();
  // Only verse cues count as outline boosts — song/announcement/custom-text
  // cues have no verse reference at all.
  const outlineRows = await db.query.cueItems.findMany({
    where: and(eq(cueItems.serviceId, serviceId), eq(cueItems.type, "verse")),
  });
  console.info(`[timing] outline query for service ${serviceId} took ${(performance.now() - t0).toFixed(1)}ms (cache miss)`);

  const outline = outlineRows
    .filter((row) => row.book !== null && row.chapter !== null && row.verse !== null)
    .map((row) => ({ book: row.book!, chapter: row.chapter!, verse: row.verse! }));
  outlineCache.set(serviceId, { outline, cachedAt: Date.now() });
  return outline;
}

export type MockDetectionMatch = {
  decision: "auto-display" | "needs-review";
  book: string;
  chapter: number;
  verse: number;
  translation: string;
  text: string;
  label: string;
};

export type MockDetectionResult = {
  chunkIndex: number;
  chunkText: string;
  isLastChunk: boolean;
  // A plural array, not a single optional match — real speech routinely
  // cites several references in one breath ("turn to John 3:16, then
  // Romans 8:28"), and a single chunk (a live AssemblyAI "turn") can easily
  // contain more than one. Deliberately flattened rather than returning the
  // engine's DetectionEvent verbatim: that type carries raw
  // similarity/confidence numbers, and the design doc is explicit that no
  // numeric confidence score should ever reach the UI — color-coded state
  // only. Flattening here, server-side, is what actually enforces that
  // rather than just trusting every call site to remember not to render it.
  matches: MockDetectionMatch[];
};

type DetectAgainstOutlineResult = {
  matches: MockDetectionMatch[];
  context: ReferenceContext | null;
};

/**
 * Re-fetches one already-matched verse's text in a different translation,
 * purely by its canonical (book, chapter, verse) reference — no detection,
 * no embeddings, just the same plain lookup getVersesForReference always
 * does. Falls back to the matching-translation text unchanged if the
 * display translation somehow has no row for this reference (shouldn't
 * happen for the canonical 66-book text every ingested translation covers,
 * but this is defensive, not load-bearing).
 */
async function fetchInDisplayTranslation(
  v: { book: string; chapter: number; verse: number; translation: string; text: string },
  displayTranslation: string,
): Promise<{ translation: string; text: string }> {
  if (displayTranslation === v.translation) return v;
  const [row] = await getVersesForReference(
    { book: v.book, chapter: v.chapter, verseStart: v.verse, verseEnd: v.verse },
    displayTranslation,
  );
  return row ?? v;
}

/**
 * Shared by both the mock-transcript path (Phase 4) and the live AssemblyAI
 * path (Phase 7) — runs one chunk of text through the detection engine using
 * this service's cue list (verse cues only) as the outline boost, and
 * flattens every match the same way for both callers.
 *
 * Matching (both the exact-reference lookup and the embedding/semantic
 * search) always runs against DEFAULT_TRANSLATION (WEB) — detectChunkEvents
 * is never told otherwise, on purpose. WEB is the only translation with
 * embeddings (see run-embed.ts), so semantic search has no choice anyway;
 * exact-match *could* run against any translation, but keeping it on the
 * same one everywhere is simpler and means a match's confidence never
 * depends on which translation happens to be selected for display.
 *
 * Every match detectChunkEvents returns is treated as a canonical reference
 * first (book/chapter/verse) and matching-translation text second — the
 * text is only ever used to know what got matched, not what gets shown.
 * Displaying it in `displayTranslation` is a completely separate lookup,
 * keyed by that reference, run here after matching is already done. This
 * is also exactly what the Control console's translation switcher reuses
 * (fetchInDisplayTranslation, exported below) to update whatever's
 * currently live when the operator changes translation mid-session,
 * without re-running detection at all.
 */
async function detectAgainstOutline(
  serviceId: string,
  chunkId: string,
  text: string,
  displayTranslation: string,
  referenceContext?: ReferenceContext,
): Promise<DetectAgainstOutlineResult> {
  const outline = await getCachedOutline(serviceId);

  const config: DetectionEngineConfig = {
    outline,
    autoDisplayThreshold: AUTO_DISPLAY_THRESHOLD,
    referenceContext,
  };
  const { events, context } = await detectChunkEvents({ id: chunkId, text }, config);

  const matches = await Promise.all(
    events.map(async (event) => {
      const v = event.best.verses[0];
      const displayed = await fetchInDisplayTranslation(v, displayTranslation);
      return {
        decision: event.decision,
        book: v.book,
        chapter: v.chapter,
        verse: v.verse,
        translation: displayed.translation,
        text: displayed.text,
        label: `${getBook(v.book)?.name ?? v.book} ${v.chapter}:${v.verse}`,
      };
    }),
  );

  return { matches, context };
}

/**
 * Runs one chunk of the mock sermon transcript (see @verger/detection-engine's
 * MOCK_SERMON_TRANSCRIPT) through the detection engine. The client calls this
 * once per chunk, paced with a delay between calls, to simulate matches
 * arriving live — see control-console.tsx's mock-demo path.
 */
export async function runMockDetectionChunkAction(
  serviceId: string,
  chunkIndex: number,
  displayTranslation: string = DEFAULT_TRANSLATION,
): Promise<MockDetectionResult> {
  await requireServiceAccess(serviceId);

  const chunk = MOCK_SERMON_TRANSCRIPT[chunkIndex];
  if (!chunk) {
    return { chunkIndex, chunkText: "", matches: [], isLastChunk: true };
  }

  const { matches } = await detectAgainstOutline(serviceId, chunk.id, chunk.text, displayTranslation);

  return {
    chunkIndex,
    chunkText: chunk.text,
    matches,
    isLastChunk: chunkIndex >= MOCK_SERMON_TRANSCRIPT.length - 1,
  };
}

export type LiveDetectionResult = {
  chunkText: string;
  matches: MockDetectionMatch[];
  /** Pass this into the next call's `context` param — see findAllReferences. */
  context: ReferenceContext | null;
  /** Server-side processing time for this chunk — see the Phase 7 fix README section on latency instrumentation. */
  timings: { durationMs: number };
};

/**
 * Same matching logic as runMockDetectionChunkAction, fed by one finalized
 * (or, per the live-detection-latency fix, partial-but-growing) turn of a
 * real AssemblyAI transcript instead of the mock array — see
 * use-live-transcription.ts for where transcript text comes from.
 */
export async function runLiveDetectionChunkAction(
  serviceId: string,
  text: string,
  displayTranslation: string = DEFAULT_TRANSLATION,
  context?: ReferenceContext,
): Promise<LiveDetectionResult> {
  await requireServiceAccess(serviceId);
  const startedAt = Date.now();
  const result = await detectAgainstOutline(serviceId, crypto.randomUUID(), text, displayTranslation, context);
  return {
    chunkText: text,
    matches: result.matches,
    context: result.context,
    timings: { durationMs: Date.now() - startedAt },
  };
}

/**
 * Fires once when the Control console mounts, to pay the local embedding
 * model's one-time load cost (a few seconds, via @huggingface/transformers —
 * see packages/bible-data/src/embeddings.ts) up front rather than
 * unpredictably on whichever transcript chunk happens to need semantic
 * search first. Real finding from piloting: without this, the first
 * paraphrase match after starting a session could take several seconds
 * longer than every match after it, and looked like "the app is just slow"
 * with no obvious cause.
 */
export async function warmUpDetectionAction(serviceId: string): Promise<void> {
  await requireServiceAccess(serviceId);
  try {
    await embedText("warm up");
  } catch {
    // Best-effort — a warm-up failure just means the first real chunk pays
    // the cold-start cost instead of nothing paying it. Not worth surfacing.
  }
}

export async function setServiceStatusAction(
  serviceId: string,
  status: "draft" | "live" | "ended",
): Promise<void> {
  await requireServiceAccess(serviceId);
  if (!db) throw new Error("Database is not configured.");

  await db.update(services).set({ status, updatedAt: new Date() }).where(eq(services.id, serviceId));
  revalidatePath(`/console/${serviceId}`);
}

// Session-level Auto/Manual display mode — chosen when a session starts
// (see control-console.tsx, which only lets this change while idle).
// Persisted server-side (not just local React state) so it's visible to any
// other operator who opens the same console, the same reasoning as
// status's draft/live/ended above.
export async function setDisplayModeAction(
  serviceId: string,
  displayMode: "auto" | "manual",
): Promise<void> {
  await requireServiceAccess(serviceId);
  if (!db) throw new Error("Database is not configured.");

  await db.update(services).set({ displayMode, updatedAt: new Date() }).where(eq(services.id, serviceId));
  revalidatePath(`/console/${serviceId}`);
}
