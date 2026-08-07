import { config } from "dotenv";
config({ path: ".env.local" });

const { sql } = await import("drizzle-orm");
const { getDb } = await import("../db");
const { verses } = await import("../db/schema");
const { fetchWebTranslation } = await import("./fetch-web");

async function main() {
  const db = getDb();
  let totalInserted = 0;

  await fetchWebTranslation(async (chapterVerses, progress) => {
    if (chapterVerses.length === 0) return;

    // Idempotent: re-running the ingest just refreshes text for existing
    // rows instead of failing on the unique constraint.
    await db
      .insert(verses)
      .values(chapterVerses)
      .onConflictDoUpdate({
        target: [verses.translation, verses.book, verses.chapter, verses.verse],
        set: { text: sql`excluded.text` },
      });

    totalInserted += chapterVerses.length;

    if (progress.done % 50 === 0 || progress.done === progress.total) {
      process.stdout.write(
        `\r${progress.done}/${progress.total} chapters (${totalInserted} verses so far)`,
      );
    }
  });

  console.log(`\nDone. Inserted/updated ${totalInserted} verses.`);
  process.exit(0);
}

main().catch((err) => {
  console.error("\nIngest failed:", err);
  process.exit(1);
});
