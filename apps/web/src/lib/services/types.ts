import type { CueSection } from "./cue-sections";

export type CueItemType = "verse" | "song_section" | "announcement_slide" | "custom_text";

export type CueItem = {
  id: string;
  position: number;
  section: CueSection;
  type: CueItemType;
  label: string;
  text: string;
  // Populated only when type === "verse".
  translation: string | null;
  book: string | null;
  chapter: number | null;
  verse: number | null;
  // Populated only when type === "song_section" — see syncSongArrangement
  // in lib/services/actions.ts.
  songSectionId: string | null;
};
