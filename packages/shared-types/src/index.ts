// Placeholder — more shared domain types (verse references, confidence levels,
// cue types, etc.) will be added as later build phases need them.
export const SHARED_TYPES_PACKAGE = "@verger/shared-types";

/**
 * Per-church role. Hierarchical: admin has every operator permission plus
 * church/team management; operator has every volunteer permission plus Prep
 * editing. "volunteer" isn't used at launch (see overview doc) but the model
 * supports it now so it isn't a later migration.
 */
export const CHURCH_ROLES = ["admin", "operator", "volunteer"] as const;
export type ChurchRole = (typeof CHURCH_ROLES)[number];

export const INVITE_STATUSES = ["pending", "accepted", "revoked"] as const;
export type InviteStatus = (typeof INVITE_STATUSES)[number];

/**
 * Placeholder translation list for the church creation / settings dropdown.
 * Real supported translations land with the Bible data layer — this is only
 * enough to make the picker functional today.
 */
export const BIBLE_TRANSLATIONS = [
  { code: "ESV", label: "English Standard Version (ESV)" },
  { code: "NIV", label: "New International Version (NIV)" },
  { code: "KJV", label: "King James Version (KJV)" },
  { code: "NASB", label: "New American Standard Bible (NASB)" },
  { code: "NLT", label: "New Living Translation (NLT)" },
  { code: "CSB", label: "Christian Standard Bible (CSB)" },
] as const;
export type BibleTranslationCode = (typeof BIBLE_TRANSLATIONS)[number]["code"];

/**
 * Role hierarchy check — admin implicitly satisfies operator/volunteer
 * requirements, operator implicitly satisfies volunteer requirements.
 */
const ROLE_RANK: Record<ChurchRole, number> = {
  volunteer: 0,
  operator: 1,
  admin: 2,
};

export function roleSatisfies(actual: ChurchRole, required: ChurchRole): boolean {
  return ROLE_RANK[actual] >= ROLE_RANK[required];
}

export function hasRequiredRole(actual: ChurchRole | null, allowed: readonly ChurchRole[]): boolean {
  if (!actual) return false;
  return allowed.some((role) => roleSatisfies(actual, role));
}
