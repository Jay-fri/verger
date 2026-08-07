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

## Translation

Ingests the **World English Bible (WEB)** — public domain, which sidesteps licensing questions
during development. Source: [bolls.life](https://bolls.life)'s public JSON API, which serves the
standard 66-book Protestant canon (bolls.life also lists Apocryphal books under higher book IDs;
the ingest script filters to IDs 1-66 only).

**A licensed modern translation (NIV, ESV, etc.) needs its own rights/licensing check with the
publisher before production use** — this is flagged per the project overview doc. Swapping in a
second translation later means adding rows with a different `translation` code; the schema
already supports multiple translations coexisting (unique constraint is on
`(translation, book, chapter, verse)`).

## Setup

```bash
cp .env.example .env.local   # same Supabase Postgres project as apps/web — copy DATABASE_URL from there
pnpm db:generate && pnpm db:migrate   # creates the `verses` table + pgvector extension
pnpm ingest    # fetches and stores the full WEB translation (~31k verses, ~1-2 min)
pnpm embed     # generates + stores embeddings for every verse (resumable if interrupted)
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
