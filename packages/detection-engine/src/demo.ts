import { fileURLToPath } from "node:url";
import { config } from "dotenv";
config({ path: fileURLToPath(new URL("../.env.local", import.meta.url)) });

import { detectFromTranscript } from "./stream";
import { MOCK_SERMON_OUTLINE, MOCK_SERMON_TRANSCRIPT } from "./mock-transcript";
import type { DetectionEngineConfig } from "./types";

// Team-mode-shaped config: a real human operator is watching the queue, so
// this is deliberately conservative — only very confident matches auto-
// display. A future solo mode would pass a lower autoDisplayThreshold here
// and nothing else about the engine would change.
const engineConfig: DetectionEngineConfig = {
  outline: MOCK_SERMON_OUTLINE,
  autoDisplayThreshold: 0.75,
};

console.log("Outline for this session:");
for (const v of MOCK_SERMON_OUTLINE) {
  console.log(`  - ${v.book} ${v.chapter}:${v.verse}`);
}
console.log();

const matchedIds = new Set<string>();

for await (const event of detectFromTranscript(MOCK_SERMON_TRANSCRIPT, engineConfig)) {
  matchedIds.add(event.chunk.id);
  const v = event.best.verses[0];
  const range =
    event.best.verses.length > 1
      ? `${v.chapter}:${v.verse}-${event.best.verses.at(-1)!.verse}`
      : `${v.chapter}:${v.verse}`;

  const badge = event.decision === "auto-display" ? "AUTO-DISPLAY" : "NEEDS REVIEW ";
  const outlineTag = event.best.inOutline ? " [in outline]" : "";
  const rawTag = event.best.rawSimilarity !== undefined ? ` raw=${event.best.rawSimilarity.toFixed(3)}` : "";

  console.log(`[${event.chunk.id}] "${event.chunk.text}"`);
  console.log(
    `   -> ${badge} | ${event.method.padEnd(8)} | ${v.book} ${range} | confidence=${event.best.confidence.toFixed(3)}${rawTag}${outlineTag}`,
  );
  console.log(`      "${v.text}"`);
  if (event.alternatives.length > 0) {
    console.log(
      `      alternatives: ${event.alternatives
        .slice(0, 2)
        .map((a) => `${a.verses[0].book} ${a.verses[0].chapter}:${a.verses[0].verse} (${a.confidence.toFixed(3)})`)
        .join(", ")}`,
    );
  }
  console.log();
}

console.log("--- chunks with no event (below the noise floor) ---");
for (const chunk of MOCK_SERMON_TRANSCRIPT) {
  if (!matchedIds.has(chunk.id)) {
    console.log(`[${chunk.id}] "${chunk.text}"`);
  }
}

process.exit(0);
