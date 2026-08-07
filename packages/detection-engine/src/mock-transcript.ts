import type { OutlineVerseRef, TranscriptChunk } from "./types";

/**
 * A fake 10-sentence sermon excerpt for sanity-checking match quality
 * end to end, before any UI exists. Deliberately mixes:
 *  - ordinary sermon speech with no scripture at all (greeting, an
 *    aside, an announcement, a closing transition) — these must produce
 *    NO event, not a low-confidence guess
 *  - references embedded in spoken phrasing ("turn to X chapter Y, verse
 *    Z"), not typed bare — realistic for a transcribed sermon
 *  - paraphrases of varying closeness to the source text
 *  - one paraphrase (Psalm 34:18) that is NOT in the outline, to show the
 *    boost only applies where it should
 */
export const MOCK_SERMON_TRANSCRIPT: TranscriptChunk[] = [
  {
    id: "1",
    text: "Good morning, church! It's wonderful to have you all here with us today.",
  },
  {
    id: "2",
    text: "Please turn with me to John chapter 3, verse 16.",
  },
  {
    id: "3",
    text: "For God so loved the world that he gave his one and only son, that whoever believes in him should not perish but have eternal life.",
  },
  {
    id: "4",
    text: "That means no matter what you've done in your past, God's love reaches out to you today.",
  },
  {
    id: "5",
    text: "As Paul writes in Romans, we know that all things work together for good for those who love God.",
  },
  {
    id: "6",
    text: "Let's also look at Philippians chapter 4, verse 13, which reminds us of God's strength.",
  },
  {
    id: "7",
    text: "I can do all things through him who gives me strength.",
  },
  {
    id: "8",
    text: "Now, I want to remind everyone about the potluck dinner happening next Saturday after the service.",
  },
  {
    id: "9",
    text: "The Lord is close to the brokenhearted and saves those who are crushed in spirit.",
  },
  {
    id: "10",
    text: "Let's stand together now and close in prayer.",
  },
];

/** What Prep would have supplied for this session — the sermon's planned verses. */
export const MOCK_SERMON_OUTLINE: OutlineVerseRef[] = [
  { book: "JHN", chapter: 3, verse: 16 },
  { book: "ROM", chapter: 8, verse: 28 },
  { book: "PHP", chapter: 4, verse: 13 },
];
