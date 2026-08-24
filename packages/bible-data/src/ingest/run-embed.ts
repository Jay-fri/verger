import { config } from "dotenv";
config({ path: ".env.local" });

const { and, eq, isNull } = await import("drizzle-orm");
const { getDb } = await import("../db");
const { verses } = await import("../db/schema");
const { embedTexts } = await import("../embeddings");
const { DEFAULT_TRANSLATION } = await import("../semantic-search");

const BATCH_SIZE = 128;

// Scoped to DEFAULT_TRANSLATION (the one "matching" translation detection
// and semantic search run against — see detect.ts) on purpose: embeddings
// are per-row, translation-specific text embeddings, and every other
// ingested translation (KJV/ASV/YLT — see run-ingest.ts) exists for DISPLAY
// only, resolved by canonical reference after a match is already found, not
// by its own embedding. Embedding them too would just be ~31k wasted vectors
// per translation, never queried (searchByEmbedding always filters
// translation = DEFAULT_TRANSLATION). If the matching translation itself
// ever changes, re-run this after re-pointing DEFAULT_TRANSLATION.
//
// Resumable by construction: each pass grabs verses that still have a null
// embedding, so re-running after an interruption just picks up where it
// left off instead of redoing work.
async function main() {
  const db = getDb();
  let totalEmbedded = 0;

  for (;;) {
    const batch = await db
      .select({ id: verses.id, text: verses.text })
      .from(verses)
      .where(and(isNull(verses.embedding), eq(verses.translation, DEFAULT_TRANSLATION)))
      .limit(BATCH_SIZE);

    if (batch.length === 0) break;

    const vectors = await embedTexts(batch.map((row) => row.text));

    await Promise.all(
      batch.map((row, i) =>
        db.update(verses).set({ embedding: vectors[i] }).where(eq(verses.id, row.id)),
      ),
    );

    totalEmbedded += batch.length;
    process.stdout.write(`\rEmbedded ${totalEmbedded} verses so far...`);
  }

  console.log(`\nDone. Embedded ${totalEmbedded} verses.`);
  process.exit(0);
}

main().catch((err) => {
  console.error("\nEmbedding failed:", err);
  process.exit(1);
});
