export type CueItemType = "verse" | "song_section" | "announcement_slide" | "custom_text";

export type CueItem = {
  id: string;
  position: number;
  type: CueItemType;
  label: string;
  text: string;
  // Populated only when type === "verse".
  translation: string | null;
  book: string | null;
  chapter: number | null;
  verse: number | null;
};
