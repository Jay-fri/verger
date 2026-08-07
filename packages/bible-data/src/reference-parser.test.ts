import { describe, expect, it } from "vitest";
import { findReference, parseReference } from "./reference-parser";

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
    });
  });

  it("finds a whole-chapter reference with 'chapter' filler", () => {
    expect(findReference("Let's turn to First Corinthians chapter 13 this morning.")).toEqual({
      book: "1CO",
      chapter: 13,
      verseStart: undefined,
      verseEnd: undefined,
    });
  });

  it("finds a reference mid-sentence with an abbreviation", () => {
    expect(findReference("As it says in Rom 8:28, all things work together for good.")).toEqual({
      book: "ROM",
      chapter: 8,
      verseStart: 28,
      verseEnd: 28,
    });
  });

  it("still works for a bare reference (superset of parseReference's cases)", () => {
    expect(findReference("John 3:16")).toEqual({ book: "JHN", chapter: 3, verseStart: 16, verseEnd: 16 });
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
