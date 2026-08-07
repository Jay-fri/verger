# @verger/detection-engine

Consumes a transcript stream and turns it into scored, routed scripture-match events. No live
audio yet — fed from a static mock transcript — and no UI; this package is testable entirely via
its own test suite, independent of `apps/web`.

## What's in here

- `src/detect.ts` — `detectChunk(chunk, config)`: the per-chunk pipeline. Tries an exact reference
  first via `@verger/bible-data`'s `findReference()` (which — unlike `parseReference()` — finds a
  reference *embedded* in a sentence, e.g. "turn to John chapter 3, verse 16", not just a bare
  "John 3:16"). Falls back to `semanticSearch()` over the raw chunk text, filters out
  implausible candidates, boosts anything in the session's Prep outline, and re-ranks.
- `src/confidence.ts` — pure scoring logic: outline membership check, and the boost/clamp math.
- `src/router.ts` — `routeByConfidence(confidence, autoDisplayThreshold)`: the single
  auto-display/needs-review decision point. This threshold is the exact lever the overview doc's
  future-extensibility notes call out as the only thing a later solo mode would change.
- `src/stream.ts` — `detectFromTranscript(chunks, config)`: an async generator wrapping
  `detectChunk` over a stream of chunks, yielding a `DetectionEvent` for each chunk that plausibly
  contains scripture. Takes `Iterable | AsyncIterable` so a real STT source can replace the mock
  array later without changing this function or anything consuming its output.
- `src/mock-transcript.ts` — the fake 10-sentence sermon excerpt + session outline used by the
  tests and the demo.
- `src/demo.ts` — human-readable printout of a full run (`pnpm demo`).

## Confidence model

- **Exact matches are always confidence 1.** ("Exact matches = highest confidence always", per the
  phase spec.)
- **Semantic matches** start from raw cosine similarity, then get `+outlineBoost` (default 0.15)
  if the matched verse is in the session's outline — and candidates are *re-ranked* by boosted
  confidence, not raw similarity, so an outline verse that wasn't the raw top-1 can still win.
- **The auto-display threshold** (`config.autoDisplayThreshold`, no default — callers must choose
  one appropriate to their session) decides auto-display vs. needs-review. Team mode wants this
  conservative (a human is watching the queue); a future solo mode would lower it. Nothing else
  about the engine changes between the two.
- **A noise floor** (`minSemanticSimilarity`, default 0.5) drops chunks that don't look like
  scripture at all, so ordinary sermon speech doesn't produce an event for every sentence.

## Known limitation, found during this phase's sanity check

The noise floor can't perfectly separate "not scripture" from "weak paraphrase" — their similarity
scores overlap. Real correct matches can score as low as ~0.6 (see `packages/bible-data`'s fixture
tests), so a floor high enough to reliably silence greetings/announcements would also start
dropping genuine weak matches. Because of this, some ordinary banter surfaces as a low-confidence
needs-review suggestion in the demo run below (e.g. "Good morning, church!" weakly matches Titus
3:15, an epistolary greeting formula — a genuine, not spurious, lexical overlap). This is safe
(never crosses into auto-display — see `detect.test.ts`'s "borderline banter" test) but not
polish-free; worth revisiting once there's usage data to calibrate against, or with a
classifier step before the semantic search.

Separately: WEB renders the divine name literally as "Yahweh" rather than "the LORD" (the
convention most translations and most spoken English use). A paraphrase using "The Lord..." for a
Yahweh-verse (e.g. Psalm 34:18) scores meaningfully lower than the same paraphrase using "Yahweh"
— see the demo's chunk 9. Worth keeping in mind if match quality on LORD/Yahweh verses matters;
not addressed in this phase.

## Running it

```bash
cp .env.example .env.local   # DATABASE_URL — same Supabase project as apps/web and bible-data
pnpm test    # unit tests (confidence/router, no DB) + integration tests against real data
pnpm demo    # pretty-printed run of the mock sermon — this is the "sanity check" output
```
