// Proclaim's four-part order-of-service model — see cueSectionEnum in
// lib/db/schema.ts. Position is a single counter across the whole service
// regardless of section, so sorting by (this fixed section order, then
// position) is what produces the correct within-section order everywhere a
// cue list gets displayed or navigated.
export const CUE_SECTIONS = ["pre_service", "warm_up", "service", "post_service"] as const;
export type CueSection = (typeof CUE_SECTIONS)[number];

export const CUE_SECTION_LABELS: Record<CueSection, string> = {
  pre_service: "Pre-service",
  warm_up: "Warm-up",
  service: "Service",
  post_service: "Post-service",
};

// Pre/post-service are typically a handful of announcement slides cycled
// before/after the actual service, not a one-pass-through sequence like the
// main Service section. "Loop" here means Next/Previous navigation wraps at
// the section's own ends instead of stopping or falling into the next
// section — see computeNextCue below, the one place this actually changes
// behavior.
export const LOOPING_SECTIONS: ReadonlySet<CueSection> = new Set(["pre_service", "post_service"]);

const SECTION_RANK: Record<CueSection, number> = Object.fromEntries(
  CUE_SECTIONS.map((section, index) => [section, index]),
) as Record<CueSection, number>;

export function sortBySectionThenPosition<T extends { section: CueSection; position: number }>(
  items: T[],
): T[] {
  return [...items].sort(
    (a, b) => SECTION_RANK[a.section] - SECTION_RANK[b.section] || a.position - b.position,
  );
}

export function groupBySection<T extends { section: CueSection }>(items: T[]): Record<CueSection, T[]> {
  const groups = { pre_service: [], warm_up: [], service: [], post_service: [] } as Record<CueSection, T[]>;
  for (const item of items) groups[item.section].push(item);
  return groups;
}

/**
 * The order-of-service "Next" item relative to whichever cue is active —
 * what the Control console's Next card and the Stage confidence monitor
 * both show. Within a looping section (pre/post-service), wraps back to
 * that section's own first item instead of falling through into the next
 * section; everywhere else, just the next item in section-then-position
 * order (or null past the end).
 */
export function computeNextCue<T extends { id: string; section: CueSection; position: number }>(
  sortedCueItems: T[],
  activeCueId: string | null,
): T | null {
  if (!activeCueId) return sortedCueItems[0] ?? null;
  const activeIndex = sortedCueItems.findIndex((item) => item.id === activeCueId);
  if (activeIndex < 0) return sortedCueItems[0] ?? null;

  const active = sortedCueItems[activeIndex];
  if (LOOPING_SECTIONS.has(active.section)) {
    const sectionItems = sortedCueItems.filter((item) => item.section === active.section);
    const posInSection = sectionItems.findIndex((item) => item.id === activeCueId);
    return sectionItems[(posInSection + 1) % sectionItems.length] ?? null;
  }

  return sortedCueItems[activeIndex + 1] ?? null;
}
