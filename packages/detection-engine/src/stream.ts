import { detectChunk } from "./detect";
import type { DetectionEngineConfig, DetectionEvent, TranscriptChunk } from "./types";

/**
 * Consumes a stream of transcript chunks and yields a scored DetectionEvent
 * for each chunk that plausibly contains scripture — a UI (or, for now, a
 * test) subscribes with `for await (const event of detectFromTranscript(...))`.
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
  for await (const chunk of chunks) {
    const event = await detectChunk(chunk, config);
    if (event) {
      yield event;
    }
  }
}
