import { IconBook2, IconMusic, IconSpeakerphone, IconTypography, type Icon } from "@tabler/icons-react";
import type { CueItemType } from "@/lib/services/types";

// The one fixed content-type vocabulary (icon + color), used identically
// everywhere a scripture/song/announcement/custom-text item appears — the
// Prep outline, Library's lists, the Control console's order-of-service
// panel, and any composer/picker. Scripture shares the accent gold on
// purpose (see globals.css): it's the hero content type this whole product
// is built around. The others are a fixed, unrelated hue each, deliberately
// distinct from confidence (sage/terracotta) and danger (panic buttons).
export const CUE_TYPE_ICON: Record<CueItemType, Icon> = {
  verse: IconBook2,
  song_section: IconMusic,
  announcement_slide: IconSpeakerphone,
  custom_text: IconTypography,
};

export const CUE_TYPE_COLOR: Record<CueItemType, string> = {
  verse: "var(--color-type-scripture)",
  song_section: "var(--color-type-song)",
  announcement_slide: "var(--color-type-announcement)",
  custom_text: "var(--color-type-custom)",
};

const LABEL: Record<CueItemType, string> = {
  verse: "Scripture",
  song_section: "Song",
  announcement_slide: "Announcement",
  custom_text: "Custom text",
};

/** The bare icon alone, colored per type — for compact contexts (list rows, drag handles' neighbor) where a full badge is too heavy. */
export function CueTypeIcon({ type, size = 16 }: { type: CueItemType; size?: number }) {
  const Icon = CUE_TYPE_ICON[type];
  return <Icon size={size} color={CUE_TYPE_COLOR[type]} stroke={1.75} aria-hidden="true" />;
}

export function CueTypeBadge({ type }: { type: CueItemType }) {
  const Icon = CUE_TYPE_ICON[type];
  const color = CUE_TYPE_COLOR[type];
  return (
    <span
      className="inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium tracking-wide uppercase"
      style={{ backgroundColor: `color-mix(in srgb, ${color} 15%, transparent)`, color }}
    >
      <Icon size={12} stroke={2} aria-hidden="true" />
      {LABEL[type]}
    </span>
  );
}
