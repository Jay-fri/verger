import { config } from "dotenv";
config({ path: ".env.local" });

const { eq, isNull } = await import("drizzle-orm");
const { getDb } = await import("../db");
const { verses } = await import("../db/schema");
const { embedTexts } = await import("../embeddings");

const BATCH_SIZE = 128;

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
      .where(isNull(verses.embedding))
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
