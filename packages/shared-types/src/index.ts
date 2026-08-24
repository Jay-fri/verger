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
 * Every translation actually ingested into the `verses` table (see
 * packages/bible-data/src/ingest/) — public domain, so none of them raise a
 * licensing question during development or production. WEB is also the one
 * "matching" translation detection/semantic search runs against (it's the
 * only one with embeddings — see run-embed.ts); the other three exist for
 * DISPLAY only, resolved by canonical reference after a match is already
 * found (see the Control console's translation switcher).
 *
 * A licensed modern translation (NIV, ESV, NASB, NLT, CSB, etc.) needs its
 * own rights/licensing check with the publisher before it could be added
 * here — bolls.life happens to serve those too (for its own app), but
 * that's not a redistribution license for this app. Don't add one of those
 * codes to this list without that clearance sorted first.
 */
export const BIBLE_TRANSLATIONS = [
  { code: "WEB", label: "World English Bible (WEB)", license: "public-domain" },
  { code: "KJV", label: "King James Version (KJV)", license: "public-domain" },
  { code: "ASV", label: "American Standard Version (ASV)", license: "public-domain" },
  { code: "YLT", label: "Young's Literal Translation (YLT)", license: "public-domain" },
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
