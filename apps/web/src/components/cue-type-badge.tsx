import type { CueItemType } from "@/lib/services/types";

const LABEL: Record<CueItemType, string> = {
  verse: "Verse",
  song_section: "Song",
  announcement_slide: "Announcement",
  custom_text: "Custom",
};

// Deliberately neutral/uncolored — sage and terracotta are reserved for AI
// detection confidence state (see AiDetectedPane), and gold is reserved for
// "active/live" (see the cue list's active highlight). A content-type badge
// using any of those colors would blur those meanings, so this is plain
// text-secondary regardless of type — the label alone distinguishes type.
export function CueTypeBadge({ type }: { type: CueItemType }) {
  return (
    <span className="shrink-0 rounded-full bg-text-secondary/15 px-2 py-0.5 text-[10px] font-medium tracking-wide text-text-secondary uppercase">
      {LABEL[type]}
    </span>
  );
}
