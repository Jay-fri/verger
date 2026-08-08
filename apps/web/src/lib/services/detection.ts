"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import {
  detectChunk,
  MOCK_SERMON_TRANSCRIPT,
  type DetectionEngineConfig,
} from "@verger/detection-engine";
import { getBook } from "@verger/bible-data";
import { db } from "@/lib/db";
import { cueItems, services } from "@/lib/db/schema";
import { requireServiceAccess } from "./access";

// Team-mode-shaped: conservative, since a human operator is watching the
// queue. A future solo mode would only need to lower this one number.
const AUTO_DISPLAY_THRESHOLD = 0.75;

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
  // Deliberately flattened rather than returning the engine's DetectionEvent
  // verbatim: that type carries raw similarity/confidence numbers, and the
  // design doc is explicit that no numeric confidence score should ever
  // reach the UI — color-coded state only. Flattening here, server-side, is
  // what actually enforces that rather than just trusting every call site
  // to remember not to render it.
  match: MockDetectionMatch | null;
};

/**
 * Runs one chunk of the mock sermon transcript (see @verger/detection-engine's
 * MOCK_SERMON_TRANSCRIPT) through the detection engine, using this service's
 * cue list as the session outline. The client calls this once per chunk,
 * paced with a delay between calls, to simulate matches arriving live —
 * see control-console.tsx.
 */
export async function runMockDetectionChunkAction(
  serviceId: string,
  chunkIndex: number,
): Promise<MockDetectionResult> {
  await requireServiceAccess(serviceId);
  if (!db) throw new Error("Database is not configured.");

  const chunk = MOCK_SERMON_TRANSCRIPT[chunkIndex];
  if (!chunk) {
    return { chunkIndex, chunkText: "", match: null, isLastChunk: true };
  }

  // Only verse cues count as outline boosts — song/announcement/custom-text
  // cues have no verse reference at all.
  const outlineRows = await db.query.cueItems.findMany({
    where: and(eq(cueItems.serviceId, serviceId), eq(cueItems.type, "verse")),
  });
  const outline = outlineRows
    .filter((row) => row.book !== null && row.chapter !== null && row.verse !== null)
    .map((row) => ({ book: row.book!, chapter: row.chapter!, verse: row.verse! }));

  const config: DetectionEngineConfig = { outline, autoDisplayThreshold: AUTO_DISPLAY_THRESHOLD };
  const event = await detectChunk(chunk, config);

  const match: MockDetectionMatch | null = event
    ? (() => {
        const v = event.best.verses[0];
        return {
          decision: event.decision,
          book: v.book,
          chapter: v.chapter,
          verse: v.verse,
          translation: v.translation,
          text: v.text,
          label: `${getBook(v.book)?.name ?? v.book} ${v.chapter}:${v.verse}`,
        };
      })()
    : null;

  return {
    chunkIndex,
    chunkText: chunk.text,
    match,
    isLastChunk: chunkIndex >= MOCK_SERMON_TRANSCRIPT.length - 1,
  };
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
