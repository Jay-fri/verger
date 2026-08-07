import { describe, expect, it } from "vitest";
import { detectChunk } from "./detect";
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
