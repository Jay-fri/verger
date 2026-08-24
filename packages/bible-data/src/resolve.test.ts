import { describe, expect, it } from "vitest";
import { getAdjacentVerse, getVersesForReference, resolveScripture } from "./resolve";
import { parseReference } from "./reference-parser";

// Integration tests against the real ingested WEB translation + real
// embeddings — this is the "verifiably correct before anything else builds
// on top of it" check the phase asked for. Requires packages/bible-data
// to have DATABASE_URL configured and the ingest/embed scripts already run
// (see README).

describe("resolveScripture — exact references", () => {
  it("resolves a single verse", async () => {
    const result = await resolveScripture("John 3:16");
    expect(result.method).toBe("exact");
    if (result.method !== "exact") throw new Error("unreachable");
    expect(result.verses).toHaveLength(1);
    expect(result.verses[0]).toMatchObject({ book: "JHN", chapter: 3, verse: 16 });
    expect(result.verses[0].text).toContain("For God so loved the world");
  });

  it("resolves a verse range via an abbreviation", async () => {
    const result = await resolveScripture("Jn 3:16-18");
    expect(result.method).toBe("exact");
    if (result.method !== "exact") throw new Error("unreachable");
    expect(result.verses.map((v) => v.verse)).toEqual([16, 17, 18]);
  });

  it("resolves a whole chapter from a spelled-out ordinal book name", async () => {
    const result = await resolveScripture("First Corinthians 13");
    expect(result.method).toBe("exact");
    if (result.method !== "exact") throw new Error("unreachable");
    expect(result.verses.length).toBeGreaterThan(1);
    expect(result.verses.every((v) => v.book === "1CO" && v.chapter === 13)).toBe(true);
    expect(result.verses[0].verse).toBe(1);
  });

  it("resolves Psalm 23:1", async () => {
    const result = await resolveScripture("Psalm 23:1");
    expect(result.method).toBe("exact");
    if (result.method !== "exact") throw new Error("unreachable");
    expect(result.verses[0].text.toLowerCase()).toContain("shepherd");
  });

  it("resolves Genesis 1:1", async () => {
    const result = await resolveScripture("Genesis 1:1");
    expect(result.method).toBe("exact");
    if (result.method !== "exact") throw new Error("unreachable");
    expect(result.verses[0].text).toContain("In the beginning");
  });

  it("resolves Philippians 4:13", async () => {
    const result = await resolveScripture("Phil 4:13");
    expect(result.method).toBe("exact");
    if (result.method !== "exact") throw new Error("unreachable");
    expect(result.verses[0]).toMatchObject({ book: "PHP", chapter: 4, verse: 13 });
  });

  it("resolves Romans 8:28", async () => {
    const result = await resolveScripture("Romans 8:28");
    expect(result.method).toBe("exact");
    if (result.method !== "exact") throw new Error("unreachable");
    expect(result.verses[0]).toMatchObject({ book: "ROM", chapter: 8, verse: 28 });
  });

  it("falls back to semantic search for a structurally valid but out-of-range reference", async () => {
    // Genesis only has 50 chapters — this parses as a reference but matches
    // zero rows, so resolveScripture should fall through to semantic search
    // on the raw text rather than returning an empty exact result.
    const result = await resolveScripture("Genesis 99:1");
    expect(result.method).not.toBe("exact");
  });
});

// The multi-translation phase: WEB stays the one "matching" translation
// (the only one embedded — see run-embed.ts), but every ingested
// translation (KJV/ASV/YLT, all public domain — see run-ingest.ts) must
// resolve the exact same canonical reference on request, with genuinely
// different wording, not the same WEB text relabeled. Real, verified text
// (not guessed) — each of these was checked against the actual ingested
// rows before being locked in here.
describe("getVersesForReference — multiple translations", () => {
  const johnThreeSixteen = parseReference("John 3:16")!;

  it("resolves the same reference with different real text per translation", async () => {
    const [web] = await getVersesForReference(johnThreeSixteen, "WEB");
    const [kjv] = await getVersesForReference(johnThreeSixteen, "KJV");
    const [asv] = await getVersesForReference(johnThreeSixteen, "ASV");
    const [ylt] = await getVersesForReference(johnThreeSixteen, "YLT");

    expect(web.text).toContain("eternal life");
    expect(kjv.text).toContain("everlasting life");
    expect(asv.text).toContain("eternal life");
    expect(ylt.text).toContain("age-during");

    // Same canonical verse, four different translation labels — the point
    // of this whole feature: one reference, several possible display texts.
    for (const row of [web, kjv, asv, ylt]) {
      expect(row).toMatchObject({ book: "JHN", chapter: 3, verse: 16 });
    }

    // Genuinely distinct wording, not the same text stamped with four
    // different translation codes.
    const distinctTexts = new Set([web.text, kjv.text, asv.text, ylt.text]);
    expect(distinctTexts.size).toBe(4);
  });

  it("strips inline Strong's-number/footnote annotations from KJV/ASV, not just their tags", async () => {
    // Real bug found ingesting these: bolls.life serves KJV/ASV with <S>
    // Strong's-number spans and <sup> footnotes inline; naively stripping
    // just the tag delimiters left the numbers as literal text glued onto
    // the preceding word with no space (e.g. "For1063 God2316"). Asserting
    // there's no digit-immediately-after-a-letter anywhere in the verse is
    // a direct regression check for that specific failure mode.
    const [kjv] = await getVersesForReference(johnThreeSixteen, "KJV");
    const [asv] = await getVersesForReference(johnThreeSixteen, "ASV");
    expect(kjv.text).not.toMatch(/[a-zA-Z]\d/);
    expect(asv.text).not.toMatch(/[a-zA-Z]\d/);
  });

  it("resolveScripture threads a non-default translation through to exact-match text", async () => {
    const result = await resolveScripture("Philippians 4:13", { translation: "KJV" });
    expect(result.method).toBe("exact");
    if (result.method !== "exact") throw new Error("unreachable");
    expect(result.verses[0].translation).toBe("KJV");
    expect(result.verses[0].text).toContain("I can do all things through Christ");
  });
});

describe("getAdjacentVerse", () => {
  it("steps forward within a chapter", async () => {
    const next = await getAdjacentVerse({ book: "JHN", chapter: 3, verse: 16 }, "next");
    expect(next).toMatchObject({ book: "JHN", chapter: 3, verse: 17 });
  });

  it("steps backward within a chapter", async () => {
    const prev = await getAdjacentVerse({ book: "JHN", chapter: 3, verse: 16 }, "prev");
    expect(prev).toMatchObject({ book: "JHN", chapter: 3, verse: 15 });
  });

  it("rolls forward into the next chapter's verse 1 at a chapter boundary", async () => {
    // John 3 has 36 verses in WEB — stepping past the last one should land
    // on John 4:1, not return null.
    const next = await getAdjacentVerse({ book: "JHN", chapter: 3, verse: 36 }, "next");
    expect(next).toMatchObject({ book: "JHN", chapter: 4, verse: 1 });
  });

  it("rolls backward into the previous chapter's last verse at a chapter boundary", async () => {
    const prev = await getAdjacentVerse({ book: "JHN", chapter: 4, verse: 1 }, "prev");
    expect(prev).toMatchObject({ book: "JHN", chapter: 3, verse: 36 });
  });

  it("returns null stepping past the end of a book", async () => {
    // Jude has one chapter, 25 verses — no book boundary crossing.
    const next = await getAdjacentVerse({ book: "JUD", chapter: 1, verse: 25 }, "next");
    expect(next).toBeNull();
  });

  it("returns null stepping before the start of a book", async () => {
    const prev = await getAdjacentVerse({ book: "GEN", chapter: 1, verse: 1 }, "prev");
    expect(prev).toBeNull();
  });
});

// Each case's top match was verified empirically against the real embedded
// WEB text before being locked in as an assertion (see PR notes) — several
// initial guesses turned out to be near-ties with a different, equally
// legitimate verse (e.g. John 3:15/16/36 all express near-identical content)
// or tripped on WEB's convention of rendering the divine name "Yahweh"
// rather than "the LORD", so the wording below is what was actually
// confirmed to resolve cleanly, not a first guess.
describe("resolveScripture — paraphrases (semantic path)", () => {
  async function topMatch(input: string) {
    const result = await resolveScripture(input);
    expect(result.method).toBe("semantic");
    if (result.method !== "semantic") throw new Error("unreachable");
    expect(result.matches.length).toBeGreaterThan(0);
    return result.matches[0];
  }

  it("Yahweh is my shepherd, I lack nothing -> Psalm 23:1", async () => {
    const top = await topMatch("Yahweh is my shepherd, I lack nothing");
    expect(top).toMatchObject({ book: "PSA", chapter: 23, verse: 1 });
  });

  it("Love is patient and kind -> 1 Corinthians 13:4", async () => {
    const top = await topMatch("Love is patient and kind");
    expect(top).toMatchObject({ book: "1CO", chapter: 13, verse: 4 });
  });

  it("I can do all things through Christ who strengthens me -> Philippians 4:13", async () => {
    const top = await topMatch("I can do all things through Christ who strengthens me");
    expect(top).toMatchObject({ book: "PHP", chapter: 4, verse: 13 });
  });

  it("In the beginning God created the heavens and the earth -> Genesis 1:1", async () => {
    const top = await topMatch("In the beginning God created the heavens and the earth");
    expect(top).toMatchObject({ book: "GEN", chapter: 1, verse: 1 });
  });

  it("Trust in the Lord, lean not on your own understanding -> Proverbs 3:5", async () => {
    const top = await topMatch(
      "Trust in the Lord with all your heart and lean not on your own understanding",
    );
    expect(top).toMatchObject({ book: "PRO", chapter: 3, verse: 5 });
  });

  it("Ask and it will be given to you, seek and you will find -> Matthew 7:7", async () => {
    const top = await topMatch("Ask and it will be given to you, seek and you will find");
    expect(top).toMatchObject({ book: "MAT", chapter: 7, verse: 7 });
  });

  it("Perfect love casts out fear -> 1 John 4:18", async () => {
    const top = await topMatch("Perfect love casts out fear");
    expect(top).toMatchObject({ book: "1JN", chapter: 4, verse: 18 });
  });

  it("The wages of sin is death but the gift of God is eternal life -> Romans 6:23", async () => {
    const top = await topMatch(
      "For the wages of sin is death but the gift of God is eternal life",
    );
    expect(top).toMatchObject({ book: "ROM", chapter: 6, verse: 23 });
  });

  it("The truth will set you free -> John 8:32", async () => {
    const top = await topMatch("The truth will set you free");
    expect(top).toMatchObject({ book: "JHN", chapter: 8, verse: 32 });
  });

  it("Blessed are the poor in spirit -> Matthew 5:3", async () => {
    const top = await topMatch("Blessed are the poor in spirit for theirs is the kingdom of heaven");
    expect(top).toMatchObject({ book: "MAT", chapter: 5, verse: 3 });
  });

  it("Where two or three gather in my name -> Matthew 18:20", async () => {
    const top = await topMatch("Where two or three gather in my name I am there with them");
    expect(top).toMatchObject({ book: "MAT", chapter: 18, verse: 20 });
  });

  it("Faith without works is dead -> James 2:17", async () => {
    const top = await topMatch("Faith without works is dead");
    expect(top).toMatchObject({ book: "JAS", chapter: 2, verse: 17 });
  });

  it("lands somewhere in John 3 for a loose paraphrase of the believing/eternal-life theme", async () => {
    // John 3:15, 3:16, and 3:36 all express near-identical content in WEB's
    // wording, so this is a genuine near-tie rather than a single "right"
    // verse — asserting the chapter (not the exact verse) is the honest
    // level of precision for this case.
    const top = await topMatch("Whoever believes in God's only son will not perish but have eternal life");
    expect(top.book).toBe("JHN");
    expect(top.chapter).toBe(3);
  });

  it("returns similarity scores in descending order", async () => {
    const result = await resolveScripture("an input with no exact reference in it at all");
    expect(result.method).toBe("semantic");
    if (result.method !== "semantic") throw new Error("unreachable");
    const similarities = result.matches.map((m) => m.similarity);
    expect(similarities).toEqual([...similarities].sort((a, b) => b - a));
    for (const s of similarities) {
      expect(s).toBeGreaterThanOrEqual(-1);
      expect(s).toBeLessThanOrEqual(1);
    }
  });
});
