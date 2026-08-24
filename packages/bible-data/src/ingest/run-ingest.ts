import { config } from "dotenv";
config({ path: ".env.local" });

const { sql } = await import("drizzle-orm");
const { getDb } = await import("../db");
const { verses } = await import("../db/schema");
const { fetchTranslation } = await import("./fetch-translation");

// `pnpm ingest` (no args) ingests WEB, the matching translation, same as
// always. `pnpm ingest -- KJV` (or ASV/YLT) ingests one of the other
// public-domain translations for DISPLAY only — see the README for why
// only WEB gets embedded (packages/bible-data/src/ingest/run-embed.ts is
// scoped to it) and the licensing flag on adding anything beyond the four
// public-domain codes this app currently uses.
const translationCode = (process.argv[2] ?? "WEB").toUpperCase();

async function main() {
  const db = getDb();
  let totalInserted = 0;

  console.log(`Ingesting ${translationCode} from bolls.life...`);
  await fetchTranslation(translationCode, async (chapterVerses, progress) => {
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
