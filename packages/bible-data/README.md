# @verger/bible-data

Indexed Bible text, exact-reference parsing, and embedding-based semantic search. No UI, no live
audio — this package is testable entirely via its own test suite and scripts, independent of
`apps/web`.

## What's in here

- `src/books.ts` — canonical 66-book metadata (code, name, abbreviations/aliases) used by the parser.
- `src/reference-parser.ts` — pure, synchronous parsing of literal references ("John 3:16", "Jn
  3:16-18", "First Corinthians 13") into `{ book, chapter, verseStart?, verseEnd? }`. No database
  access — purely syntactic.
- `src/embeddings.ts` — wraps a local sentence-embedding model
  ([`Xenova/all-MiniLM-L6-v2`](https://huggingface.co/Xenova/all-MiniLM-L6-v2) via
  `@huggingface/transformers`, 384 dimensions). Runs on-device via ONNX — no API key, no
  per-call cost, no external service dependency once the model weights are cached locally.
- `src/db/schema.ts` — the `verses` table (Drizzle + pgvector).
- `src/semantic-search.ts` — embeds a query and ranks verses by cosine similarity (pgvector `<=>`).
- `src/resolve.ts` — `resolveScripture(input)`, the single function the detection engine (next
  phase) will call: tries exact-reference parsing first, falls back to semantic search over the
  raw input only if the exact path finds nothing (either the text didn't parse as a reference, or
  it parsed but matched zero rows — e.g. "Genesis 99:1").
- `src/ingest/` — one-time data loading scripts (see below).

## Translations

Ingests four **public-domain** translations, which sidesteps licensing questions entirely —
**World English Bible (WEB)**, **King James Version (KJV)**, **American Standard Version (ASV)**,
and **Young's Literal Translation (YLT)**. Source for all four:
[bolls.life](https://bolls.life)'s public JSON API, which serves the standard 66-book Protestant
canon under each translation's own short code (bolls.life also lists Apocryphal books under
higher book IDs; the ingest script filters to IDs 1-66 only, and re-verifies book order/count per
translation — see the Strong's-number note below for why "per translation," not just once).

**WEB is the one "matching" translation** — the only one with embeddings (`run-embed.ts` is
explicitly scoped to it via `DEFAULT_TRANSLATION`), since detection/semantic search need to run
against one consistent vector space. KJV/ASV/YLT exist for **display only**: resolved by
canonical `(book, chapter, verse)` reference after a match is already found in WEB, never
searched themselves. See the root README's "Multiple translations, switchable live" section for
how `apps/web` wires this decoupling into the Control console's live translation switcher.

**A licensed modern translation (NIV, ESV, NASB, NLT, CSB, etc.) needs its own rights/licensing
check with the publisher before production use** — this is flagged per the project overview doc,
and enforced in code via `BIBLE_TRANSLATIONS` in `packages/shared-types`, which only ever lists
translations actually ingested here. bolls.life happens to serve those other codes too (for its
own app) — that's not a redistribution license for this one. Adding a fifth translation later is
just `pnpm ingest <CODE>` with a new bolls.life short code; the schema already supports
multiple translations coexisting (unique constraint is on `(translation, book, chapter, verse)`).

**Real bug found ingesting KJV/ASV**: bolls.life serves both with inline Strong's-number
(`<S>1063</S>`) and footnote (`<sup>...</sup>`) annotations baked directly into the verse text.
The original `cleanText()` only stripped tag delimiters, not their content, leaving numbers glued
onto the preceding word with no space (`"For1063 God2316"` — every word, not an edge case). Fixed
by stripping those two tags as whole spans (delimiters *and* content) before the generic
formatting-tag strip that still correctly keeps WEB's occasional `<b>` inner text. Verified against
the full dataset: zero rows in either translation match `/[a-zA-Z]\d/` post-fix.

## Setup

```bash
cp .env.example .env.local   # same Supabase Postgres project as apps/web — copy DATABASE_URL from there
pnpm db:generate && pnpm db:migrate   # creates the `verses` table + pgvector extension
pnpm ingest              # fetches and stores WEB (~31k verses, ~1-2 min) — the matching translation
pnpm ingest KJV       # (or ASV / YLT) — display-only, no embedding step needed for these
pnpm embed               # generates + stores embeddings for WEB only (resumable if interrupted)
```

After both scripts finish, apply the HNSW vector index migration
(`drizzle/0001_embedding_hnsw_index.sql`) if `pnpm db:migrate` hasn't already picked it up —
it's deliberately a separate migration applied *after* the data load, since building the index
after a bulk insert is faster than maintaining it incrementally during one.

## Running tests

```bash
pnpm test
```

`reference-parser.test.ts` is pure unit tests (abbreviations, ranges, full names, malformed
input) — no database needed. `resolve.test.ts` is an integration suite against the real ingested
+ embedded data (the 15+ fixture cases mixing exact references and paraphrases the phase asked
for) — it requires `pnpm ingest` and `pnpm embed` to have been run first.
