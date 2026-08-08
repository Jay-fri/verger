import { detectChunkEvents } from "./detect";
import type { DetectionEngineConfig, DetectionEvent, TranscriptChunk } from "./types";

/**
 * Consumes a stream of transcript chunks and yields a scored DetectionEvent
 * for each match found — a UI (or, for now, a test) subscribes with
 * `for await (const event of detectFromTranscript(...))`. A single chunk can
 * yield more than one event (e.g. two exact references cited back to back
 * in the same chunk); see detectChunkEvents.
 *
 * Takes `Iterable | AsyncIterable` rather than a plain array on purpose:
 * today it's fed a static array simulating a transcript (see demo.ts), but
 * the same function will work unchanged once a real STT source replaces the
 * array with an async generator over live speech chunks — only the caller's
 * chunk source changes, not this function or anything consuming its output.
 */
export async function* detectFromTranscript(
  chunks: Iterable<TranscriptChunk> | AsyncIterable<TranscriptChunk>,
  config: DetectionEngineConfig,
): AsyncGenerator<DetectionEvent> {
  // Threads book/chapter context from one chunk to the next automatically
  // (a bare "verse 28" a few chunks after "Romans chapter 8" still
  // resolves) — external to this generator's own signature, so callers
  // don't need to know this bookkeeping happens.
  let context = config.referenceContext;
  for await (const chunk of chunks) {
    const { events, context: nextContext } = await detectChunkEvents(chunk, {
      ...config,
      referenceContext: context,
    });
    context = nextContext ?? context;
    for (const event of events) {
      yield event;
    }
  }
}
