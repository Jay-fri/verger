import { describe, expect, it } from "vitest";
import { semanticSearch } from "@verger/bible-data";
import { detectChunk, detectChunkEvents } from "./detect";
import { detectFromTranscript } from "./stream";
import { MOCK_SERMON_OUTLINE, MOCK_SERMON_TRANSCRIPT } from "./mock-transcript";
import type { DetectionEngineConfig } from "./types";

// Integration tests against the real ingested + embedded WEB translation
// from packages/bible-data — this is the sanity check the phase asked for,
// run for real rather than mocked. See src/demo.ts for a human-readable
// printout of the same run (`pnpm demo`).

const byId = new Map(MOCK_SERMON_TRANSCRIPT.map((c) => [c.id, c]));

// Team-mode-shaped config: conservative auto-display threshold, since a
// human operator is watching. A solo-mode config would only change this one
// number — see router.test.ts.
const TEAM_CONFIG: DetectionEngineConfig = {
  outline: MOCK_SERMON_OUTLINE,
  autoDisplayThreshold: 0.75,
};

describe("detectChunk — exact references embedded in spoken sentences", () => {
  it('"Please turn with me to John chapter 3, verse 16." -> John 3:16, auto-display', async () => {
    const event = await detectChunk(byId.get("2")!, TEAM_CONFIG);
    expect(event?.method).toBe("exact");
    expect(event?.decision).toBe("auto-display");
    expect(event?.best.confidence).toBe(1);
    expect(event?.best.inOutline).toBe(true);
    expect(event?.best.verses[0]).toMatchObject({ book: "JHN", chapter: 3, verse: 16 });
  });

  it('"Let\'s also look at Philippians chapter 4, verse 13..." -> Philippians 4:13, auto-display', async () => {
    const event = await detectChunk(byId.get("6")!, TEAM_CONFIG);
    expect(event?.method).toBe("exact");
    expect(event?.decision).toBe("auto-display");
    expect(event?.best.verses[0]).toMatchObject({ book: "PHP", chapter: 4, verse: 13 });
  });
});

describe("detectChunk — paraphrases, boosted by the outline", () => {
  it("near-verbatim John 3:16 paraphrase matches and auto-displays", async () => {
    const event = await detectChunk(byId.get("3")!, TEAM_CONFIG);
    expect(event?.method).toBe("semantic");
    expect(event?.best.verses[0]).toMatchObject({ book: "JHN", chapter: 3, verse: 16 });
    expect(event?.best.inOutline).toBe(true);
    expect(event?.decision).toBe("auto-display");
  });

  it("Romans 8:28 paraphrase matches and auto-displays", async () => {
    const event = await detectChunk(byId.get("5")!, TEAM_CONFIG);
    expect(event?.best.verses[0]).toMatchObject({ book: "ROM", chapter: 8, verse: 28 });
    expect(event?.best.inOutline).toBe(true);
    expect(event?.decision).toBe("auto-display");
  });

  it("Philippians 4:13 paraphrase matches and auto-displays", async () => {
    const event = await detectChunk(byId.get("7")!, TEAM_CONFIG);
    expect(event?.best.verses[0]).toMatchObject({ book: "PHP", chapter: 4, verse: 13 });
    expect(event?.best.inOutline).toBe(true);
    expect(event?.decision).toBe("auto-display");
  });

  it("the outline boost is what pushes these over the auto-display threshold", async () => {
    // Without the boost, Romans 8:28's raw similarity (~0.83) still clears
    // 0.75 on its own, but Philippians 4:13's raw similarity (~0.73) does
    // NOT — the boosted confidence is strictly higher than raw similarity
    // for both, and it's the boost that decides Philippians specifically.
    const event = await detectChunk(byId.get("7")!, TEAM_CONFIG);
    expect(event!.best.rawSimilarity!).toBeLessThan(TEAM_CONFIG.autoDisplayThreshold);
    expect(event!.best.confidence).toBeGreaterThanOrEqual(TEAM_CONFIG.autoDisplayThreshold);

    const withoutOutline = await detectChunk(byId.get("7")!, { ...TEAM_CONFIG, outline: [] });
    expect(withoutOutline?.decision).toBe("needs-review");
  });
});

describe("detectChunk — ordinary sermon speech (not scripture)", () => {
  it("a clear non-scripture announcement produces no event at all", async () => {
    const event = await detectChunk(byId.get("8")!, TEAM_CONFIG);
    expect(event).toBeNull();
  });

  it("borderline banter never crosses into auto-display, even when it produces a low-confidence event", async () => {
    // Real finding from this sanity check: a similarity floor alone can't
    // perfectly separate "not scripture" from "weak paraphrase" — greeting
    // and prayer-adjacent banter can score in the same range as a genuine
    // weak match (see README's "Known limitations"). The router's
    // auto-display threshold is the actual safety net: these chunks may
    // surface a needs-review suggestion, but must never auto-display.
    for (const id of ["1", "4", "9", "10"]) {
      const event = await detectChunk(byId.get(id)!, TEAM_CONFIG);
      if (event) {
        expect(event.decision).toBe("needs-review");
      }
    }
  });
});

// Real speech routinely cites several references in one breath — a single
// AssemblyAI transcript "turn" can easily contain more than one, unlike the
// mock sermon's deliberately one-reference-per-chunk design. This is the
// bug behind "lots of scriptures mentioned but it didn't capture it" during
// live piloting: detectChunk (and findReference before it) only ever
// surfaced the first.
describe("detectChunkEvents — multiple exact references in one chunk", () => {
  it("returns one event per reference, in the order they were spoken", async () => {
    const { events } = await detectChunkEvents(
      {
        id: "multi",
        text: "Turn with me to John chapter 3, verse 16, then Romans chapter 8, verse 28.",
      },
      TEAM_CONFIG,
    );
    expect(events).toHaveLength(2);
    expect(events[0].method).toBe("exact");
    expect(events[0].best.verses[0]).toMatchObject({ book: "JHN", chapter: 3, verse: 16 });
    expect(events[1].method).toBe("exact");
    expect(events[1].best.verses[0]).toMatchObject({ book: "ROM", chapter: 8, verse: 28 });
  });

  it("a bare chapter mention routes to needs-review even though exact matches are confidence 1", async () => {
    const { events, context } = await detectChunkEvents(
      { id: "chapter-only", text: "Let's turn to Romans chapter eight together." },
      TEAM_CONFIG,
    );
    expect(events).toHaveLength(1);
    expect(events[0].best.confidence).toBe(1);
    expect(events[0].decision).toBe("needs-review");
    expect(context).toEqual({ book: "ROM", chapter: 8 });
  });

  it("resolves a bare verse using context carried in from a previous chunk", async () => {
    const first = await detectChunkEvents(
      { id: "c1", text: "Let's turn to Romans chapter eight together." },
      TEAM_CONFIG,
    );
    const second = await detectChunkEvents(
      { id: "c2", text: "A few seconds later, verse twenty eight says this." },
      { ...TEAM_CONFIG, referenceContext: first.context ?? undefined },
    );
    expect(second.events).toHaveLength(1);
    expect(second.events[0].best.verses[0]).toMatchObject({ book: "ROM", chapter: 8, verse: 28 });
    expect(second.events[0].decision).toBe("auto-display");
  });

  it("detectChunk still returns just the first, for callers that only want one", async () => {
    const event = await detectChunk(
      {
        id: "multi",
        text: "Turn with me to John chapter 3, verse 16, then Romans chapter 8, verse 28.",
      },
      TEAM_CONFIG,
    );
    expect(event?.best.verses[0]).toMatchObject({ book: "JHN", chapter: 3, verse: 16 });
  });

  it("detectFromTranscript yields both events for a chunk mentioning two references", async () => {
    const chunk = {
      id: "multi",
      text: "Turn with me to John chapter 3, verse 16, then Romans chapter 8, verse 28.",
    };
    const events = [];
    for await (const event of detectFromTranscript([chunk], TEAM_CONFIG)) {
      events.push(event);
    }
    expect(events.map((e) => e.best.verses[0].book)).toEqual(["JHN", "ROM"]);
  });
});

// Real example from piloting: "like in 2 Corinthians 6 where Timothy said
// [a paraphrase]..." produced no scripture at all. Two related gaps:
// (1) a chapter-only reference ("2 Corinthians 6", no verse) was being
// treated as too incomplete to act on; (2) even when it *was* recognized,
// finding it short-circuited the whole chunk, so the paraphrase describing
// which verse within that chapter never got a chance to narrow it down.
describe("detectChunkEvents — chapter-only references and scoped semantic search", () => {
  it("a chapter-only reference alone falls back to the chapter's opening verse, needs-review", async () => {
    // Exactly the piloting example, minus the paraphrase — the parser must
    // not silently discard "2 Corinthians 6" for lacking a verse number.
    const { events } = await detectChunkEvents({ id: "ch-only", text: "like in 2 Corinthians 6" }, TEAM_CONFIG);
    expect(events).toHaveLength(1);
    expect(events[0].method).toBe("exact");
    expect(events[0].decision).toBe("needs-review");
    expect(events[0].best.verses[0]).toMatchObject({ book: "2CO", chapter: 6, verse: 1 });
  });

  it("the exact piloting example: chapter-only reference + paraphrase resolves via scoped semantic search", async () => {
    const { events } = await detectChunkEvents(
      {
        id: "pilot-example",
        text: "like in 2 Corinthians 6 where Timothy said we shouldn't be unequally yoked with unbelievers",
      },
      TEAM_CONFIG,
    );
    expect(events).toHaveLength(1);
    expect(events[0].method).toBe("semantic");
    // 6:14 ("Don't be unequally yoked with unbelievers"), not the generic
    // 6:1 fallback — the paraphrase, scoped to just 2 Corinthians 6, found
    // the actual verse instead of only the chapter's opening line.
    expect(events[0].best.verses[0]).toMatchObject({ book: "2CO", chapter: 6, verse: 14 });
  });

  it("scoped search finding nothing usable still falls back to the chapter-only entry, not nothing", async () => {
    // A real, run-of-the-mill paraphrase, but too indirect for the scoped
    // search to confidently pin to one verse within Romans 12 — requirement
    // #1's guarantee still holds even when requirement #2's narrowing comes
    // up empty: the operator gets the chapter's start, not nothing.
    const { events } = await detectChunkEvents(
      { id: "ch-only-weak-paraphrase", text: "in Romans chapter twelve, give everything you have back to God as your worship" },
      TEAM_CONFIG,
    );
    expect(events).toHaveLength(1);
    expect(events[0].method).toBe("exact");
    expect(events[0].decision).toBe("needs-review");
    expect(events[0].best.verses[0]).toMatchObject({ book: "ROM", chapter: 12, verse: 1 });
  });

  it("Ephesians 6 + a paraphrase of the armor of God resolves to the specific verse", async () => {
    const { events } = await detectChunkEvents(
      {
        id: "eph6",
        text: "over in Ephesians chapter six, stand firm then, having buckled the belt of truth around your waist",
      },
      TEAM_CONFIG,
    );
    expect(events[0].method).toBe("semantic");
    expect(events[0].best.verses[0]).toMatchObject({ book: "EPH", chapter: 6, verse: 14 });
  });

  it("James 1 + a paraphrase of 'count it all joy' resolves to the specific verse", async () => {
    const { events } = await detectChunkEvents(
      { id: "jas1", text: "James chapter one, count it all joy when you fall into various trials" },
      TEAM_CONFIG,
    );
    expect(events[0].method).toBe("semantic");
    expect(events[0].best.verses[0]).toMatchObject({ book: "JAS", chapter: 1, verse: 2 });
  });

  it("Philippians 2 + a paraphrase of the kenosis passage resolves to the specific verse", async () => {
    const { events } = await detectChunkEvents(
      {
        id: "php2",
        text: "Philippians chapter two, have this same mindset as Christ Jesus who did not consider equality with God something to be grasped",
      },
      TEAM_CONFIG,
    );
    expect(events[0].method).toBe("semantic");
    expect(events[0].best.verses[0]).toMatchObject({ book: "PHP", chapter: 2, verse: 6 });
  });

  it("Romans 12 + a paraphrase of 'living sacrifice' resolves to the specific verse", async () => {
    const { events } = await detectChunkEvents(
      {
        id: "rom12",
        text: "Romans chapter twelve tells us to offer our bodies as a living sacrifice, holy and pleasing to God",
      },
      TEAM_CONFIG,
    );
    expect(events[0].method).toBe("semantic");
    expect(events[0].best.verses[0]).toMatchObject({ book: "ROM", chapter: 12, verse: 1 });
  });

  it("book-only mention (no chapter at all) still scopes semantic search, to the whole book", async () => {
    const { events } = await detectChunkEvents(
      { id: "eph-book-only", text: "as Paul tells the Ephesians, we should walk in love just as Christ loved us" },
      TEAM_CONFIG,
    );
    expect(events[0].method).toBe("semantic");
    expect(events[0].best.verses[0]).toMatchObject({ book: "EPH", chapter: 5, verse: 2 });
  });

  it("a bare chapter mention with no accompanying content still just falls back (regression check)", async () => {
    // The pre-existing chapter-only test, still correct after this change —
    // scoped semantic search is attempted but finds nothing for this text,
    // so the chapter-only entry is what's actually returned.
    const { events, context } = await detectChunkEvents(
      { id: "chapter-only", text: "Let's turn to Romans chapter eight together." },
      TEAM_CONFIG,
    );
    expect(events).toHaveLength(1);
    expect(events[0].method).toBe("exact");
    expect(events[0].decision).toBe("needs-review");
    expect(context).toEqual({ book: "ROM", chapter: 8 });
  });

  describe("scoped vs. unscoped semantic search, side by side", () => {
    it("Ephesians 4 'new self' paraphrase: unscoped picks the wrong book entirely, scoped lands in the right chapter", async () => {
      // Deliberately generic/oblique wording — searched against the whole
      // Bible, the top result is a real but wrong verse from a different
      // book — exactly the false-positive risk scoping is meant to reduce.
      const paraphrase = "put on the new self and get rid of your old sinful ways";

      const unscoped = await detectChunkEvents({ id: "unscoped-new-self", text: paraphrase }, TEAM_CONFIG);
      expect(unscoped.events[0]?.best.verses[0].book).not.toBe("EPH");

      const scoped = await detectChunkEvents(
        { id: "scoped-new-self", text: `over in Ephesians chapter four, ${paraphrase}` },
        TEAM_CONFIG,
      );
      expect(scoped.events[0].method).toBe("semantic");
      expect(scoped.events[0].best.verses[0]).toMatchObject({ book: "EPH", chapter: 4 });
    });

    it("a weak paraphrase: unscoped picks a wrong book with real-looking confidence, scoped correctly finds nothing and falls back", async () => {
      // Not every paraphrase resolves even with scoping (requirement #2 is
      // explicit that this is an improvement, not a guarantee) — the
      // meaningful difference is that unscoped confidently commits to the
      // wrong verse, while scoped honestly comes up empty and defers to
      // the chapter-only fallback (needs-review) instead of guessing.
      const paraphrase = "give everything you have back to God as your worship";

      const unscoped = await detectChunkEvents({ id: "unscoped-worship", text: paraphrase }, TEAM_CONFIG);
      expect(unscoped.events[0]?.best.verses[0]).not.toMatchObject({ book: "ROM", chapter: 12 });

      const scoped = await detectChunkEvents(
        { id: "scoped-worship", text: `in Romans chapter twelve, ${paraphrase}` },
        TEAM_CONFIG,
      );
      expect(scoped.events[0].method).toBe("exact"); // the chapter-only fallback, not a wrong semantic guess
      expect(scoped.events[0].best.verses[0]).toMatchObject({ book: "ROM", chapter: 12, verse: 1 });
    });

    it("scoping narrows the field of competing candidates even when the top pick doesn't change", async () => {
      // "Count it all joy" already wins unscoped (it's fairly distinctive
      // wording) — the improvement here isn't which verse wins, it's how
      // much weaker the nearest competitor is once cross-book noise is
      // excluded, which is what actually protects against a slightly
      // different paraphrase tipping the wrong way. Uses semanticSearch
      // directly (not detectChunkEvents) to compare the raw, unfiltered
      // candidate lists — detectChunkEvents' own "alternatives" are already
      // floor-filtered, and for the unscoped case every runner-up here
      // falls below that floor individually, which would make the
      // comparison vacuous.
      const paraphrase = "count it all joy when you fall into various trials";

      const unscoped = await semanticSearch(paraphrase, { limit: 5 });
      const scoped = await semanticSearch(paraphrase, { limit: 5, scope: { book: "JAS", chapter: 1 } });

      expect(unscoped[0]).toMatchObject({ book: "JAS", chapter: 1, verse: 2 });
      expect(scoped[0]).toMatchObject({ book: "JAS", chapter: 1, verse: 2 });

      // Same top verse either way, but the scoped runner-up (still within
      // James 1) is meaningfully weaker than the unscoped runner-up (a real
      // competing verse from a different book) — scoping reduced cross-book
      // competition even though it didn't need to change the winner here.
      expect(scoped[1].similarity).toBeLessThan(unscoped[1].similarity);
    });
  });
});

describe("detectFromTranscript — full stream", () => {
  it("yields exactly the expected auto-display verses, in order, for the mock sermon", async () => {
    const autoDisplayed: string[] = [];
    for await (const event of detectFromTranscript(MOCK_SERMON_TRANSCRIPT, TEAM_CONFIG)) {
      if (event.decision === "auto-display") {
        const v = event.best.verses[0];
        autoDisplayed.push(`${v.book} ${v.chapter}:${v.verse}`);
      }
    }

    expect(autoDisplayed).toEqual([
      "JHN 3:16", // chunk 2, exact
      "JHN 3:16", // chunk 3, semantic
      "ROM 8:28", // chunk 5, semantic
      "PHP 4:13", // chunk 6, exact
      "PHP 4:13", // chunk 7, semantic
    ]);
  });

  it("never emits an event for a chunk with no plausible match", async () => {
    const emittedIds = new Set<string>();
    for await (const event of detectFromTranscript(MOCK_SERMON_TRANSCRIPT, TEAM_CONFIG)) {
      emittedIds.add(event.chunk.id);
    }
    expect(emittedIds.has("8")).toBe(false); // potluck announcement
  });
});
