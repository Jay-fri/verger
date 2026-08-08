import { describe, expect, it } from "vitest";
import { findAllReferences, findReference, normalizeSpokenNumbers, parseReference } from "./reference-parser";

describe("parseReference — full book names", () => {
  it("parses a single verse", () => {
    expect(parseReference("John 3:16")).toEqual({ book: "JHN", chapter: 3, verseStart: 16, verseEnd: 16 });
  });

  it("parses a whole-chapter reference with no verse", () => {
    expect(parseReference("Romans 8")).toEqual({ book: "ROM", chapter: 8, verseStart: undefined, verseEnd: undefined });
  });

  it("parses a multi-word book name", () => {
    expect(parseReference("Song of Solomon 2:1")).toEqual({
      book: "SNG",
      chapter: 2,
      verseStart: 1,
      verseEnd: 1,
    });
  });
});

describe("parseReference — abbreviations", () => {
  it("parses a common short abbreviation", () => {
    expect(parseReference("Jn 3:16")).toEqual({ book: "JHN", chapter: 3, verseStart: 16, verseEnd: 16 });
  });

  it("parses a period-suffixed abbreviation", () => {
    expect(parseReference("Gen. 1:1")).toEqual({ book: "GEN", chapter: 1, verseStart: 1, verseEnd: 1 });
  });

  it("resolves 'Ps' to Psalms", () => {
    expect(parseReference("Ps 23:1")).toEqual({ book: "PSA", chapter: 23, verseStart: 1, verseEnd: 1 });
  });

  it("resolves 'Psalm' (singular) to Psalms", () => {
    expect(parseReference("Psalm 23")).toEqual({ book: "PSA", chapter: 23, verseStart: undefined, verseEnd: undefined });
  });
});

describe("parseReference — ordinal-prefixed books", () => {
  it("parses '1 Cor' with a numeral ordinal", () => {
    expect(parseReference("1 Cor 13:4-7")).toEqual({ book: "1CO", chapter: 13, verseStart: 4, verseEnd: 7 });
  });

  it("parses 'First Corinthians' spelled out, whole chapter", () => {
    expect(parseReference("First Corinthians 13")).toEqual({
      book: "1CO",
      chapter: 13,
      verseStart: undefined,
      verseEnd: undefined,
    });
  });

  it("parses 'I Corinthians' (Roman numeral ordinal)", () => {
    expect(parseReference("I Corinthians 13:4")).toEqual({ book: "1CO", chapter: 13, verseStart: 4, verseEnd: 4 });
  });

  it("distinguishes 1 John from 2 John", () => {
    expect(parseReference("1 John 4:8")).toEqual({ book: "1JN", chapter: 4, verseStart: 8, verseEnd: 8 });
    expect(parseReference("2 John 1:6")).toEqual({ book: "2JN", chapter: 1, verseStart: 6, verseEnd: 6 });
  });

  it("does not confuse Jude with Judges", () => {
    expect(parseReference("Jude 1:3")?.book).toBe("JUD");
    expect(parseReference("Judges 3:1")?.book).toBe("JDG");
  });

  it("does not confuse Philippians with Philemon", () => {
    expect(parseReference("Phil 4:13")?.book).toBe("PHP");
    expect(parseReference("Philem 3")?.book).toBe("PHM");
  });
});

describe("parseReference — ranges", () => {
  it("parses a verse range", () => {
    expect(parseReference("Jn 3:16-18")).toEqual({ book: "JHN", chapter: 3, verseStart: 16, verseEnd: 18 });
  });

  it("parses a range using an en dash", () => {
    expect(parseReference("1 Corinthians 13:4–7")).toEqual({ book: "1CO", chapter: 13, verseStart: 4, verseEnd: 7 });
  });
});

describe("parseReference — formatting tolerance", () => {
  it("is case-insensitive", () => {
    expect(parseReference("JOHN 3:16")).toEqual({ book: "JHN", chapter: 3, verseStart: 16, verseEnd: 16 });
    expect(parseReference("john 3:16")).toEqual({ book: "JHN", chapter: 3, verseStart: 16, verseEnd: 16 });
  });

  it("tolerates extra internal whitespace", () => {
    expect(parseReference("John   3 : 16")).toEqual({ book: "JHN", chapter: 3, verseStart: 16, verseEnd: 16 });
  });

  it("tolerates leading/trailing whitespace", () => {
    expect(parseReference("  John 3:16  ")).toEqual({ book: "JHN", chapter: 3, verseStart: 16, verseEnd: 16 });
  });
});

describe("parseReference — non-references", () => {
  it("returns null for a bare book name with no chapter", () => {
    expect(parseReference("John")).toBeNull();
  });

  it("returns null for freeform paraphrase text", () => {
    expect(parseReference("For God so loved the world")).toBeNull();
  });

  it("returns null for a paraphrase that happens to start with a book-like word", () => {
    expect(parseReference("Job 23 is my favorite psalm")).toBeNull();
  });

  it("returns null for empty input", () => {
    expect(parseReference("")).toBeNull();
    expect(parseReference("   ")).toBeNull();
  });

  it("returns null for an unrecognized book name", () => {
    expect(parseReference("Frodo 1:1")).toBeNull();
  });

  it("returns null for a reversed verse range", () => {
    expect(parseReference("John 3:18-16")).toBeNull();
  });
});

describe("findReference — embedded in spoken/transcribed sentences", () => {
  it("finds a reference after spoken filler words", () => {
    expect(findReference("Turn with me if you would to John chapter 3, verse 16.")).toEqual({
      book: "JHN",
      chapter: 3,
      verseStart: 16,
      verseEnd: 16,
      isWholeChapter: false,
    });
  });

  it("finds a whole-chapter reference with 'chapter' filler", () => {
    expect(findReference("Let's turn to First Corinthians chapter 13 this morning.")).toEqual({
      book: "1CO",
      chapter: 13,
      isWholeChapter: true,
    });
  });

  it("finds a reference mid-sentence with an abbreviation", () => {
    expect(findReference("As it says in Rom 8:28, all things work together for good.")).toEqual({
      book: "ROM",
      chapter: 8,
      verseStart: 28,
      verseEnd: 28,
      isWholeChapter: false,
    });
  });

  it("still works for a bare reference (superset of parseReference's cases)", () => {
    expect(findReference("John 3:16")).toEqual({
      book: "JHN",
      chapter: 3,
      verseStart: 16,
      verseEnd: 16,
      isWholeChapter: false,
    });
  });

  it("returns null for a sentence with no reference at all", () => {
    expect(findReference("Good morning, church! So good to see you all today.")).toBeNull();
  });

  it("returns null for an announcement with numbers but no book name", () => {
    expect(findReference("The potluck starts at 6:30 on Saturday.")).toBeNull();
  });

  it("picks the leftmost reference when a sentence mentions two", () => {
    expect(findReference("We read Romans 8:28 earlier, but today's focus is John 3:16.")).toMatchObject({
      book: "ROM",
      chapter: 8,
      verseStart: 28,
    });
  });
});

// Real preaching regularly cites several references back to back within one
// breath/sentence ("turn to X, then flip over to Y") — a single AssemblyAI
// transcript turn can easily contain more than one. findReference()
// deliberately only ever returns the first, so the detection engine needs
// this to catch the rest instead of silently dropping them.
describe("findAllReferences — multiple references in one chunk", () => {
  it("finds both references when a sentence mentions two, in order", () => {
    const { refs } = findAllReferences("We read Romans 8:28 earlier, but today's focus is John 3:16.");
    expect(refs).toEqual([
      { book: "ROM", chapter: 8, verseStart: 28, verseEnd: 28, isWholeChapter: false },
      { book: "JHN", chapter: 3, verseStart: 16, verseEnd: 16, isWholeChapter: false },
    ]);
  });

  it("finds three references cited consecutively", () => {
    const { refs } = findAllReferences(
      "Turn with me to John chapter 3, verse 16, then Romans chapter 8, verse 28, and finally Philippians chapter 4, verse 13.",
    );
    expect(refs.map((r) => `${r.book} ${r.chapter}:${r.verseStart}`)).toEqual([
      "JHN 3:16",
      "ROM 8:28",
      "PHP 4:13",
    ]);
  });

  it("returns a single-element array for a chunk with one reference", () => {
    const { refs } = findAllReferences("Please turn with me to John chapter 3, verse 16.");
    expect(refs).toEqual([{ book: "JHN", chapter: 3, verseStart: 16, verseEnd: 16, isWholeChapter: false }]);
  });

  it("returns an empty array for ordinary sermon speech", () => {
    expect(findAllReferences("Good morning, church! So good to see you all today.").refs).toEqual([]);
  });

  it("does not double-count the same reference matched by two overlapping aliases", () => {
    // "1 Corinthians" and "Corinthians" alone aren't both valid aliases, but
    // book names with overlapping alias prefixes (e.g. "John" inside "1
    // John") could otherwise double-match the same span — confirm only one
    // reference comes out per actual mention.
    const { refs } = findAllReferences("First John chapter 4, verse 18 is a good verse.");
    expect(refs).toHaveLength(1);
    expect(refs[0]).toMatchObject({ book: "1JN", chapter: 4, verseStart: 18 });
  });

  it("still emits a whole-chapter reference, flagged, when no verse is ever stated", () => {
    const { refs } = findAllReferences("Let's turn to First Corinthians chapter 13 this morning.");
    expect(refs).toEqual([{ book: "1CO", chapter: 13, isWholeChapter: true }]);
  });
});

describe("normalizeSpokenNumbers", () => {
  it("converts a simple cardinal number word", () => {
    expect(normalizeSpokenNumbers("chapter three")).toBe("chapter 3");
  });

  it("converts a compound tens+units number", () => {
    expect(normalizeSpokenNumbers("verse twenty eight")).toBe("verse 28");
  });

  it("converts a teen number", () => {
    expect(normalizeSpokenNumbers("verse sixteen")).toBe("verse 16");
  });

  it("converts a hundred-based number (Psalm 119)", () => {
    expect(normalizeSpokenNumbers("psalm one hundred and nineteen")).toBe("psalm 119");
  });

  it("treats adjacent complete numbers as separate values, not a sum", () => {
    // "Romans eight twenty-eight" means chapter 8, verse 28 — not 8+20+8.
    expect(normalizeSpokenNumbers("romans eight twenty eight")).toBe("romans 8 28");
  });

  it("leaves non-number words untouched", () => {
    expect(normalizeSpokenNumbers("the book of romans")).toBe("the book of romans");
  });
});

// The parser as originally built expected written-style citations ("John
// 3:16"). These fixtures are real spoken-sermon phrasing instead — number
// words, no colons, chapter/verse spread across a sentence, references
// separated by filler — the actual shape of what AssemblyAI hands the
// detection engine. At least 20 cases, per the piloting feedback that
// motivated this rewrite.
describe("findAllReferences — realistic spoken-style sentences", () => {
  function firstRef(text: string) {
    return findAllReferences(text).refs[0];
  }

  it("1. chapter/verse fully spelled out with a comma pause", () => {
    expect(firstRef("Please turn with me to John, chapter three, verse sixteen.")).toMatchObject({
      book: "JHN", chapter: 3, verseStart: 16, verseEnd: 16,
    });
  });

  it("2. chapter/verse spelled out with no punctuation at all (raw partial-transcript style)", () => {
    expect(firstRef("turn with me to john chapter three verse sixteen")).toMatchObject({
      book: "JHN", chapter: 3, verseStart: 16, verseEnd: 16,
    });
  });

  it("3. terse spoken form, book then two bare number words, no chapter/verse keywords", () => {
    expect(firstRef("as it says in romans eight twenty eight all things work together for good")).toMatchObject({
      book: "ROM", chapter: 8, verseStart: 28, verseEnd: 28,
    });
  });

  it("4. book stated via 'the book of X' filler phrase", () => {
    expect(firstRef("we will be reading from the book of James chapter one verse five today")).toMatchObject({
      book: "JAS", chapter: 1, verseStart: 5, verseEnd: 5,
    });
  });

  it("5. verse stated well after chapter, separated by an unrelated clause", () => {
    expect(
      firstRef("the book of Romans, chapter eight, and let's look at verse twenty eight"),
    ).toMatchObject({ book: "ROM", chapter: 8, verseStart: 28, verseEnd: 28 });
  });

  it("6. verse-before-chapter ordering ('verse Y of chapter X')", () => {
    expect(firstRef("in Ephesians, verse eight of chapter two, we read this")).toMatchObject({
      book: "EPH", chapter: 2, verseStart: 8, verseEnd: 8,
    });
  });

  it("7. a bare 'verse N' resolved from a book/chapter stated earlier in the SAME sentence", () => {
    expect(
      firstRef("Turn to Philippians chapter four. Now look down at verse thirteen with me."),
    ).toMatchObject({ book: "PHP", chapter: 4, verseStart: 13, verseEnd: 13 });
  });

  it("8. a bare 'verse N' resolved from context carried over from a PREVIOUS chunk", () => {
    const first = findAllReferences("Let's turn to Romans chapter eight together.");
    // The chapter alone still produces a (flagged) whole-chapter reference —
    // see detectChunkEvents for why that's routed conservatively rather than
    // suppressed outright — but the important thing here is the context.
    expect(first.context).toEqual({ book: "ROM", chapter: 8 });

    const second = findAllReferences(
      "A few seconds later, verse twenty eight says this.",
      first.context ?? undefined,
    );
    expect(second.refs[0]).toMatchObject({ book: "ROM", chapter: 8, verseStart: 28, verseEnd: 28 });
  });

  it("9. hundred-based chapter and verse numbers (a long psalm)", () => {
    expect(
      firstRef("turn to psalm one hundred and nineteen, verse one hundred and five"),
    ).toMatchObject({ book: "PSA", chapter: 119, verseStart: 105, verseEnd: 105 });
  });

  it("10. a verse range stated with 'through'", () => {
    expect(firstRef("look at Romans chapter twelve, verses one through two")).toMatchObject({
      book: "ROM", chapter: 12, verseStart: 1, verseEnd: 2,
    });
  });

  it("11. a verse range stated with 'to'", () => {
    expect(firstRef("first corinthians chapter thirteen verse four to seven")).toMatchObject({
      book: "1CO", chapter: 13, verseStart: 4, verseEnd: 7,
    });
  });

  it("12. an abbreviated book name spoken casually", () => {
    expect(firstRef("flip over to Phil chapter four verse thirteen")).toMatchObject({
      book: "PHP", chapter: 4, verseStart: 13, verseEnd: 13,
    });
  });

  it("13. an ordinal-prefixed book spoken as 'first'", () => {
    expect(firstRef("in first peter chapter five verse seven we're told to cast our anxiety on him")).toMatchObject(
      { book: "1PE", chapter: 5, verseStart: 7, verseEnd: 7 },
    );
  });

  it("14. an ordinal-prefixed book spoken as 'second'", () => {
    expect(firstRef("second timothy chapter three verse sixteen tells us scripture is God breathed")).toMatchObject({
      book: "2TI", chapter: 3, verseStart: 16, verseEnd: 16,
    });
  });

  it("15. a commonly mis-heard book name — Ecclesiastes", () => {
    expect(firstRef("Ecclesiastes chapter three verse one has a time for everything")).toMatchObject({
      book: "ECC", chapter: 3, verseStart: 1, verseEnd: 1,
    });
  });

  it("16. a commonly mis-heard book name — Philippians vs Philemon", () => {
    expect(firstRef("Philippians chapter one verse six is a great promise")?.book).toBe("PHP");
    expect(firstRef("Philemon verse six is a short letter")).toBeUndefined(); // single-chapter book, known limitation — see parseReference's doc comment
  });

  it("17. two references in one continuous run-on sentence, no pause between them", () => {
    const { refs } = findAllReferences(
      "turn to john chapter three verse sixteen and then flip over to romans chapter eight verse twenty eight right now",
    );
    expect(refs.map((r) => `${r.book} ${r.chapter}:${r.verseStart}`)).toEqual(["JHN 3:16", "ROM 8:28"]);
  });

  it("18. a multi-word book name spoken naturally", () => {
    expect(firstRef("turn to song of solomon chapter two verse one")).toMatchObject({
      book: "SNG", chapter: 2, verseStart: 1, verseEnd: 1,
    });
  });

  it("19. ordinary sermon speech with numbers in it produces no reference", () => {
    expect(findAllReferences("we'll be starting the service at eleven o'clock this morning").refs).toEqual([]);
  });

  it("20. a greeting with no scripture at all produces no reference", () => {
    expect(findAllReferences("good morning everybody it's so good to see you all here today").refs).toEqual([]);
  });

  it("21. 'the book of' filler before a multi-word ordinal book name", () => {
    expect(firstRef("we're reading from the book of first corinthians chapter thirteen verse four")).toMatchObject({
      book: "1CO", chapter: 13, verseStart: 4, verseEnd: 4,
    });
  });

  it("22. bare digits still work when the transcript happens to format them (defense in depth)", () => {
    expect(firstRef("turn to john chapter 3 verse 16")).toMatchObject({
      book: "JHN", chapter: 3, verseStart: 16, verseEnd: 16,
    });
  });

  it("23. an ordinary use of the word 'act' doesn't get mistaken for the book of Acts mid-sentence", () => {
    // Real bug found while testing scoped semantic search: "act" is also an
    // alias for Acts, so "...as an act of worship" after "Romans chapter
    // twelve" was silently overwriting the tracked context from {ROM, 12}
    // to {ACT, null} — corrupting a downstream chapter/book scope with no
    // visible error. "Is"/"Am" (Isaiah/Amos) have the same collision risk
    // and are excluded the same way.
    const result = findAllReferences(
      "in Romans chapter twelve, give everything you have back to God as an act of worship",
    );
    expect(result.context).toEqual({ book: "ROM", chapter: 12 });
  });

  it("24. an ordinary use of the word 'job' doesn't get mistaken for the book of Job mid-sentence", () => {
    // Real bug found live-testing the Bug 1/2/3 fixes: "my job was
    // uncertain" mid-sentence matched "Job" (the book's own name) as a
    // fresh mention, overwriting whatever context Philippians 4:13 had
    // just established a moment earlier. Same fix pattern as "act" above.
    const result = findAllReferences(
      "let's also consider philippians chapter four verse thirteen, my job was uncertain but God was faithful",
    );
    expect(result.context).toEqual({ book: "PHP", chapter: 4 });
  });

  it("25. 'chapter number N, verse number N' resolves, even well past a long preamble", () => {
    // Real bug from a live piloting session: a formal/dictation-style
    // "chapter number 5, verse number 17" phrasing (the filler word
    // "number" between the keyword and the digit) wasn't recognized at
    // all — neither "chapter" nor "verse" were immediately followed by a
    // digit, the pattern the scanner otherwise expects, so the reference
    // was invisible to it despite being unambiguous to a human reader.
    // Logged as a "frozen match input" bug (0 matches even after the
    // reference clearly appeared in the growing transcript) before being
    // root-caused to this parsing gap rather than a truncation bug.
    const result = findAllReferences(
      "Actually, on the Hebrew, here's the word: to deal wisely. Okay, so in " +
        "Ephesians chapter number 5, verse number 17, it says to walk carefully.",
    );
    expect(result.refs).toEqual([
      { book: "EPH", chapter: 5, verseStart: 17, verseEnd: 17, isWholeChapter: false },
    ]);
  });

  it("26. 'verse number N of chapter number M' (verse-first, both fillered) still resolves", () => {
    // Exercises the verse-first "verse N of chapter M" path specifically —
    // the previous test only exercises the chapter-first path. Same
    // "number" filler-word bug, different branch of the scanner.
    const result = findAllReferences("in Romans, let's look at verse number 28 of chapter number 8");
    expect(result.refs).toEqual([
      { book: "ROM", chapter: 8, verseStart: 28, verseEnd: 28, isWholeChapter: false },
    ]);
  });
});
