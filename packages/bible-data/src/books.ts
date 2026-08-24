export type Testament = "OT" | "NT";

export type BookMeta = {
  /** Canonical short code, also used as the `book` column value in Postgres. */
  code: string;
  /** Canonical display name. */
  name: string;
  testament: Testament;
  /**
   * Alternate names/abbreviations the reference parser will recognize,
   * case-insensitively, with or without trailing periods. Ordinal-prefixed
   * books (1/2/3 John, etc.) list every common way people write the
   * ordinal — "1", "I", "First" — since sermon transcripts use all three.
   */
  aliases: string[];
};

// Order matters: it's the canonical Bible order, and ingestion maps 1-indexed
// position in this array directly to bolls.life's bookid (verified to match
// 1-66 for the standard Protestant canon — see src/ingest/fetch-translation.ts).
export const BOOKS: BookMeta[] = [
  { code: "GEN", name: "Genesis", testament: "OT", aliases: ["Gen", "Ge", "Gn"] },
  { code: "EXO", name: "Exodus", testament: "OT", aliases: ["Exod", "Exo", "Ex"] },
  { code: "LEV", name: "Leviticus", testament: "OT", aliases: ["Lev", "Le", "Lv"] },
  { code: "NUM", name: "Numbers", testament: "OT", aliases: ["Num", "Nu", "Nm", "Nb"] },
  {
    code: "DEU",
    name: "Deuteronomy",
    testament: "OT",
    aliases: ["Deut", "Deu", "De", "Dt"],
  },
  { code: "JOS", name: "Joshua", testament: "OT", aliases: ["Josh", "Jos", "Jsh"] },
  { code: "JDG", name: "Judges", testament: "OT", aliases: ["Judg", "Jdg", "Jg", "Jdgs"] },
  { code: "RUT", name: "Ruth", testament: "OT", aliases: ["Rth", "Ru"] },
  {
    code: "1SA",
    name: "1 Samuel",
    testament: "OT",
    aliases: [
      "1 Sam",
      "1Sa",
      "1Sam",
      "I Samuel",
      "I Sam",
      "First Samuel",
      "1st Samuel",
      "1 Sm",
    ],
  },
  {
    code: "2SA",
    name: "2 Samuel",
    testament: "OT",
    aliases: [
      "2 Sam",
      "2Sa",
      "2Sam",
      "II Samuel",
      "II Sam",
      "Second Samuel",
      "2nd Samuel",
      "2 Sm",
    ],
  },
  {
    code: "1KI",
    name: "1 Kings",
    testament: "OT",
    aliases: ["1 Kgs", "1Ki", "1Kgs", "I Kings", "First Kings", "1st Kings"],
  },
  {
    code: "2KI",
    name: "2 Kings",
    testament: "OT",
    aliases: ["2 Kgs", "2Ki", "2Kgs", "II Kings", "Second Kings", "2nd Kings"],
  },
  {
    code: "1CH",
    name: "1 Chronicles",
    testament: "OT",
    aliases: ["1 Chron", "1 Chr", "1Ch", "I Chronicles", "First Chronicles", "1st Chronicles"],
  },
  {
    code: "2CH",
    name: "2 Chronicles",
    testament: "OT",
    aliases: ["2 Chron", "2 Chr", "2Ch", "II Chronicles", "Second Chronicles", "2nd Chronicles"],
  },
  { code: "EZR", name: "Ezra", testament: "OT", aliases: ["Ezr"] },
  { code: "NEH", name: "Nehemiah", testament: "OT", aliases: ["Neh", "Ne"] },
  {
    code: "EST",
    name: "Esther",
    testament: "OT",
    aliases: ["Esth", "Est", "Es"],
  },
  { code: "JOB", name: "Job", testament: "OT", aliases: ["Jb"] },
  {
    code: "PSA",
    name: "Psalms",
    testament: "OT",
    aliases: ["Psalm", "Ps", "Pss", "Psa", "Psm"],
  },
  { code: "PRO", name: "Proverbs", testament: "OT", aliases: ["Prov", "Pro", "Pr", "Prv"] },
  {
    code: "ECC",
    name: "Ecclesiastes",
    testament: "OT",
    aliases: ["Eccles", "Eccl", "Ecc", "Ec", "Qoheleth"],
  },
  {
    code: "SNG",
    name: "Song of Solomon",
    testament: "OT",
    aliases: [
      "Song of Songs",
      "Song",
      "SOS",
      "Sol",
      "Canticles",
      "Cant",
    ],
  },
  { code: "ISA", name: "Isaiah", testament: "OT", aliases: ["Isa", "Is"] },
  { code: "JER", name: "Jeremiah", testament: "OT", aliases: ["Jer", "Je", "Jr"] },
  { code: "LAM", name: "Lamentations", testament: "OT", aliases: ["Lam", "La"] },
  {
    code: "EZK",
    name: "Ezekiel",
    testament: "OT",
    aliases: ["Ezek", "Eze", "Ezk"],
  },
  { code: "DAN", name: "Daniel", testament: "OT", aliases: ["Dan", "Da", "Dn"] },
  { code: "HOS", name: "Hosea", testament: "OT", aliases: ["Hos", "Ho"] },
  { code: "JOL", name: "Joel", testament: "OT", aliases: ["Jl"] },
  { code: "AMO", name: "Amos", testament: "OT", aliases: ["Am"] },
  { code: "OBA", name: "Obadiah", testament: "OT", aliases: ["Obad", "Ob"] },
  { code: "JON", name: "Jonah", testament: "OT", aliases: ["Jnh", "Jon"] },
  { code: "MIC", name: "Micah", testament: "OT", aliases: ["Mic", "Mc"] },
  { code: "NAM", name: "Nahum", testament: "OT", aliases: ["Nah", "Na"] },
  { code: "HAB", name: "Habakkuk", testament: "OT", aliases: ["Hab", "Hb"] },
  { code: "ZEP", name: "Zephaniah", testament: "OT", aliases: ["Zeph", "Zep", "Zp"] },
  { code: "HAG", name: "Haggai", testament: "OT", aliases: ["Hag", "Hg"] },
  {
    code: "ZEC",
    name: "Zechariah",
    testament: "OT",
    aliases: ["Zech", "Zec", "Zc"],
  },
  { code: "MAL", name: "Malachi", testament: "OT", aliases: ["Mal", "Ml"] },
  { code: "MAT", name: "Matthew", testament: "NT", aliases: ["Matt", "Mt"] },
  { code: "MRK", name: "Mark", testament: "NT", aliases: ["Mrk", "Mk", "Mr"] },
  { code: "LUK", name: "Luke", testament: "NT", aliases: ["Luk", "Lk"] },
  { code: "JHN", name: "John", testament: "NT", aliases: ["Jn", "Jhn", "Joh"] },
  { code: "ACT", name: "Acts", testament: "NT", aliases: ["Act", "Ac"] },
  { code: "ROM", name: "Romans", testament: "NT", aliases: ["Rom", "Ro", "Rm"] },
  {
    code: "1CO",
    name: "1 Corinthians",
    testament: "NT",
    aliases: [
      "1 Cor",
      "1Co",
      "1Cor",
      "I Corinthians",
      "I Cor",
      "First Corinthians",
      "1st Corinthians",
    ],
  },
  {
    code: "2CO",
    name: "2 Corinthians",
    testament: "NT",
    aliases: [
      "2 Cor",
      "2Co",
      "2Cor",
      "II Corinthians",
      "II Cor",
      "Second Corinthians",
      "2nd Corinthians",
    ],
  },
  { code: "GAL", name: "Galatians", testament: "NT", aliases: ["Gal", "Ga"] },
  { code: "EPH", name: "Ephesians", testament: "NT", aliases: ["Eph"] },
  {
    code: "PHP",
    name: "Philippians",
    testament: "NT",
    aliases: ["Phil", "Php", "Pp"],
  },
  { code: "COL", name: "Colossians", testament: "NT", aliases: ["Col"] },
  {
    code: "1TH",
    name: "1 Thessalonians",
    testament: "NT",
    aliases: [
      "1 Thess",
      "1Th",
      "1Thess",
      "I Thessalonians",
      "First Thessalonians",
      "1st Thessalonians",
    ],
  },
  {
    code: "2TH",
    name: "2 Thessalonians",
    testament: "NT",
    aliases: [
      "2 Thess",
      "2Th",
      "2Thess",
      "II Thessalonians",
      "Second Thessalonians",
      "2nd Thessalonians",
    ],
  },
  {
    code: "1TI",
    name: "1 Timothy",
    testament: "NT",
    aliases: ["1 Tim", "1Ti", "1Tim", "I Timothy", "First Timothy", "1st Timothy"],
  },
  {
    code: "2TI",
    name: "2 Timothy",
    testament: "NT",
    aliases: ["2 Tim", "2Ti", "2Tim", "II Timothy", "Second Timothy", "2nd Timothy"],
  },
  { code: "TIT", name: "Titus", testament: "NT", aliases: ["Tit", "Ti"] },
  { code: "PHM", name: "Philemon", testament: "NT", aliases: ["Philem", "Phm", "Pm"] },
  { code: "HEB", name: "Hebrews", testament: "NT", aliases: ["Heb"] },
  { code: "JAS", name: "James", testament: "NT", aliases: ["Jas", "Jm"] },
  {
    code: "1PE",
    name: "1 Peter",
    testament: "NT",
    aliases: ["1 Pet", "1Pe", "1Pet", "I Peter", "First Peter", "1st Peter"],
  },
  {
    code: "2PE",
    name: "2 Peter",
    testament: "NT",
    aliases: ["2 Pet", "2Pe", "2Pet", "II Peter", "Second Peter", "2nd Peter"],
  },
  {
    code: "1JN",
    name: "1 John",
    testament: "NT",
    aliases: ["1 Jn", "1Jo", "1Jn", "I John", "First John", "1st John"],
  },
  {
    code: "2JN",
    name: "2 John",
    testament: "NT",
    aliases: ["2 Jn", "2Jo", "2Jn", "II John", "Second John", "2nd John"],
  },
  {
    code: "3JN",
    name: "3 John",
    testament: "NT",
    aliases: ["3 Jn", "3Jo", "3Jn", "III John", "Third John", "3rd John"],
  },
  { code: "JUD", name: "Jude", testament: "NT", aliases: ["Jud", "Jde"] },
  {
    code: "REV",
    name: "Revelation",
    testament: "NT",
    aliases: ["Rev", "Re", "The Revelation", "Apocalypse"],
  },
];

export const BOOKS_BY_CODE: ReadonlyMap<string, BookMeta> = new Map(
  BOOKS.map((book) => [book.code, book]),
);

export function getBook(code: string): BookMeta | undefined {
  return BOOKS_BY_CODE.get(code);
}
