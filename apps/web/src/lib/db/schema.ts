import { relations } from "drizzle-orm";
import {
  integer,
  pgEnum,
  pgSchema,
  pgTable,
  serial,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { CHURCH_ROLES, INVITE_STATUSES } from "@verger/shared-types";

// Infra-verification table only — proves the Next.js -> Drizzle -> Supabase
// Postgres path works end to end. Domain tables land in later build phases.
export const healthChecks = pgTable("health_checks", {
  id: serial("id").primaryKey(),
  checkedAt: timestamp("checked_at", { withTimezone: true }).defaultNow().notNull(),
});

// Reference-only model of Supabase's auth.users table, so church tables can
// declare a real FK against it. Deliberately NOT exported: drizzle-kit scans
// every exported pgTable in this file to decide what to create, and Supabase
// (not us) owns and manages auth.users — schemaFilter alone doesn't stop
// drizzle-kit from emitting a CREATE TABLE for it if the table object is
// visible on the module. Keeping it module-private still lets the tables
// below reference `authUsers.id` for a real FK constraint.
const authSchema = pgSchema("auth");
const authUsers = authSchema.table("users", {
  id: uuid("id").primaryKey(),
});

export const churchRoleEnum = pgEnum("church_role", CHURCH_ROLES);
export const inviteStatusEnum = pgEnum("invite_status", INVITE_STATUSES);

// Mirrors auth.users (id, email, display name) into the public schema via a
// database trigger (see drizzle/0002_profiles_trigger_and_rls.sql) — the
// standard Supabase pattern, since application code should never query
// auth.users directly.
export const profiles = pgTable("profiles", {
  id: uuid("id")
    .primaryKey()
    .references(() => authUsers.id, { onDelete: "cascade" }),
  email: text("email").notNull(),
  fullName: text("full_name"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

// The top-level tenant. Services, cue lists, and Bible data preferences all
// belong to a church, never directly to a user.
export const churches = pgTable("churches", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  // WEB (World English Bible) — public domain and always available, unlike
  // the placeholder "ESV" default this column briefly shipped with (ESV
  // isn't ingested and would silently 500 downstream). See
  // @verger/shared-types' BIBLE_TRANSLATIONS for the full list of ingested,
  // public-domain translations this can be set to. Editable post-onboarding
  // in Settings — see updateChurchDefaultTranslationAction.
  defaultTranslation: text("default_translation").notNull().default("WEB"),
  // A data: URL (base64-encoded image), not a Storage bucket reference —
  // deliberate simplification: this avoids a manual Supabase Storage bucket
  // creation step, at the cost of not being a great fit for large images.
  // Upload is capped client-side (see settings' logo upload form) to keep
  // this row reasonably sized. Used by the Stage output's "Logo" panic
  // button (see live_state.mode).
  logoDataUrl: text("logo_data_url"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

// A user's role within one church. A user with no rows here has no church.
// A user with exactly one row is the common case (including solo/one-person
// churches) — nothing in this model assumes a multi-person team.
export const churchMembers = pgTable(
  "church_members",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    churchId: uuid("church_id")
      .notNull()
      .references(() => churches.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => authUsers.id, { onDelete: "cascade" }),
    role: churchRoleEnum("role").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [unique("church_members_church_user_unique").on(table.churchId, table.userId)],
);

// A pending (or resolved) invitation for someone to join a church at a given
// role. Email sending isn't wired up yet — see the TODO in the invite Server
// Action — so for now the invite link itself is the deliverable.
export const churchInvites = pgTable("church_invites", {
  id: uuid("id").primaryKey().defaultRandom(),
  churchId: uuid("church_id")
    .notNull()
    .references(() => churches.id, { onDelete: "cascade" }),
  email: text("email").notNull(),
  role: churchRoleEnum("role").notNull(),
  token: text("token").notNull().unique(),
  invitedBy: uuid("invited_by")
    .notNull()
    .references(() => authUsers.id),
  status: inviteStatusEnum("status").notNull().default("pending"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  acceptedAt: timestamp("accepted_at", { withTimezone: true }),
});

export const serviceStatusEnum = pgEnum("service_status", ["draft", "live", "ended"]);

// Session-level, chosen when a session starts (see control-console.tsx's
// display-mode toggle, shown while sessionState is "idle"). Replaces a raw
// confidence-threshold config with a simpler mental model per the
// competitive audit (PewBeam: pick once per service). Auto/Manual only
// changes whether a confident AI match is allowed to auto-push to the live
// output — the underlying confidence computation (and the AI Detected
// queue's sage/terracotta coloring) is unaffected either way; see
// detectAgainstOutline's fixed AUTO_DISPLAY_THRESHOLD in
// apps/web/src/lib/services/detection.ts.
export const displayModeEnum = pgEnum("display_mode", ["auto", "manual"]);

// A Prep outline: the operator-built plan for a service, with an ordered
// list of verse cues. "Starting a mock session" (Phase 4) or a real one
// (later) transitions status to "live" — nothing outside this app reads
// that yet (no Stage output route, no Realtime sync), so it's currently
// just bookkeeping for the Control console's own UI.
export const services = pgTable("services", {
  id: uuid("id").primaryKey().defaultRandom(),
  churchId: uuid("church_id")
    .notNull()
    .references(() => churches.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  // Defaults to the upcoming Sunday at creation time (see createServiceAction)
  // — what the redesigned home screen's "This week" hero card displays and
  // uses to decide which service is "current" (the most recent non-ended
  // service scoped to this church, per computeServiceState). Editable later
  // if a real date-picker UI is ever needed; not exposed yet.
  scheduledFor: timestamp("scheduled_for", { withTimezone: true }).notNull().defaultNow(),
  status: serviceStatusEnum("status").notNull().default("draft"),
  displayMode: displayModeEnum("display_mode").notNull().default("auto"),
  createdBy: uuid("created_by")
    .notNull()
    .references(() => authUsers.id),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const cueItemTypeEnum = pgEnum("cue_item_type", [
  "verse",
  "song_section",
  "announcement_slide",
  "custom_text",
]);

// A church's reusable content library — songs, announcements, and custom
// text all belong to the church (not a service), so the same song can be
// cued in multiple services. Each is a title plus an ordered set of slides;
// a "slide" is a song section (label + lyrics), an announcement slide
// (plain text), or — for custom text — just the one slide, since it's
// meant for one-off use (see custom_texts below) rather than a structured
// multi-slide sequence like the other two.
export const songs = pgTable("songs", {
  id: uuid("id").primaryKey().defaultRandom(),
  churchId: uuid("church_id")
    .notNull()
    .references(() => churches.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  // The song_sections.id sequence most recently used to cue this song into
  // *any* service, in the order they were arranged — so building this song
  // into a service a second time can offer that arrangement back instead of
  // making the operator rebuild the section order from scratch every time.
  // Kept in sync by syncSongArrangement() (see lib/services/actions.ts)
  // whenever a service's cue list is edited in a way that touches this
  // song's sections (add, remove, or reorder) — always reflects the most
  // recently *touched* service's current arrangement for this song, not
  // necessarily the most recently *created* one. Null until the song has
  // been cued into a service at least once.
  lastArrangement: text("last_arrangement").array(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const songSections = pgTable("song_sections", {
  id: uuid("id").primaryKey().defaultRandom(),
  songId: uuid("song_id")
    .notNull()
    .references(() => songs.id, { onDelete: "cascade" }),
  position: integer("position").notNull(),
  // e.g. "Verse 1", "Chorus", "Bridge" — operator-entered, not a fixed enum,
  // since section naming conventions vary by song/church.
  label: text("label").notNull(),
  lyrics: text("lyrics").notNull(),
});

export const announcements = pgTable("announcements", {
  id: uuid("id").primaryKey().defaultRandom(),
  churchId: uuid("church_id")
    .notNull()
    .references(() => churches.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const announcementSlides = pgTable("announcement_slides", {
  id: uuid("id").primaryKey().defaultRandom(),
  announcementId: uuid("announcement_id")
    .notNull()
    .references(() => announcements.id, { onDelete: "cascade" }),
  position: integer("position").notNull(),
  text: text("text").notNull(),
});

// Freeform one-off text — a single slide, no sub-sections. Still
// church-scoped and technically reusable (the data model doesn't forbid
// cueing the same one in another service), but built for the "type
// something once, put it on screen" case rather than a structured library
// entry like songs/announcements.
export const customTexts = pgTable("custom_texts", {
  id: uuid("id").primaryKey().defaultRandom(),
  churchId: uuid("church_id")
    .notNull()
    .references(() => churches.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  text: text("text").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

// Proclaim's four-part order-of-service model. Position (below) is a single
// counter across the whole service regardless of section — sorting by
// (section's fixed order, then position) still yields the correct
// within-section order, so this doesn't need per-section position resets.
// See CUE_SECTION_ORDER in lib/services/types.ts for the fixed section
// ordering, and control-console.tsx for the pre/post-service loop
// (wrap-around) navigation behavior these two sections get that "service"
// and "warm_up" don't.
export const cueSectionEnum = pgEnum("cue_section", [
  "pre_service",
  "warm_up",
  "service",
  "post_service",
]);

// One item in a service's ordered cue list — a verse, a song section, an
// announcement slide, or a custom text slide. Content is cached at add-time
// (label + text; verse ref fields only populated when type = "verse")
// rather than joined live from the library — consistent with how verses
// already worked in Phase 4, and desirable here too: a service's cue list
// shouldn't retroactively change if someone edits the song library later.
export const cueItems = pgTable("cue_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  serviceId: uuid("service_id")
    .notNull()
    .references(() => services.id, { onDelete: "cascade" }),
  position: integer("position").notNull(),
  section: cueSectionEnum("section").notNull().default("service"),
  type: cueItemTypeEnum("type").notNull().default("verse"),
  label: text("label").notNull(),
  text: text("text").notNull(),
  // Verse-only fields — null for every other type.
  translation: text("translation"),
  book: text("book"),
  chapter: integer("chapter"),
  verse: integer("verse"),
  // song_section-only — null for every other type (including custom text
  // and announcement slides, which have no equivalent "reusable order"
  // concept). This is what lets syncSongArrangement() trace a cue item back
  // to which song it belongs to and in what order, to keep
  // songs.lastArrangement up to date. onDelete "set null" (not cascade):
  // deleting a song section from the library shouldn't delete cue items
  // that already cached its label/text into past services' outlines —
  // consistent with this table's existing content-is-cached-not-joined
  // design.
  songSectionId: uuid("song_section_id").references(() => songSections.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

// "quick" (Phase 6.5) is an ad-hoc push from the Control console's
// always-available quick-insert panel — custom text, a song section, or a
// scripture search — pushed live without touching the operator's position
// in the order-of-service cue list.
export const liveStateSourceEnum = pgEnum("live_state_source", [
  "cue",
  "detection",
  "search",
  "quick",
]);

// "content" is the normal case (whatever text/label/type/source above say).
// The other three are the panic-button states (Clear/Black/Logo) — they
// deliberately do NOT touch text/label/source/type, so "keep any
// background" (per the feature spec) is just "we didn't overwrite the
// underlying content row, only how the Stage output renders it right now."
// Bypass the Control console's minimum-display-time debounce entirely —
// see control-console.tsx's panic-button handlers, which call
// setLiveStateModeAction directly rather than going through pushLive's
// automatic-replacement throttling.
export const liveStateModeEnum = pgEnum("live_state_mode", ["content", "clear", "black", "logo"]);

// What's currently on screen for a service — one row per service, upserted
// every time the Control console pushes something live (cue click, AI
// confirm, AI auto-display, or manual search push). This table (not a
// broadcast-only message) is the source of truth specifically so the Stage
// output route shows the right thing immediately on load/reconnect, not
// just on the next change — Postgres Changes both delivers the live update
// *and* backs a plain SELECT for that initial fetch. See
// src/app/stage/[serviceId] and src/lib/services/live-state.ts.
//
// Also backs the Stage confidence monitor (src/app/monitor/[serviceId]) — a
// second, pastor/band-facing route sharing this same table and Realtime
// channel rather than standing up a separate one. next{Label,Text,Type} are
// denormalized (cached at write-time, same philosophy as cue_items' own
// content caching) rather than joined live from cue_items, specifically so
// the public monitor route only ever needs to read this one table, the same
// "public if you know the service ID" trust boundary the audience Stage
// output already relies on — see drizzle/0008_live_state_realtime_and_rls.sql.
// operatorMessage is monitor-only (never rendered on the audience Stage
// output) — see control-console.tsx's operator-message field.
export const liveState = pgTable("live_state", {
  serviceId: uuid("service_id")
    .primaryKey()
    .references(() => services.id, { onDelete: "cascade" }),
  source: liveStateSourceEnum("source").notNull(),
  type: cueItemTypeEnum("type").notNull(),
  label: text("label").notNull(),
  text: text("text").notNull(),
  // Verse-only, nullable for every other type — same pattern as cue_items'
  // own verse-only fields. What makes multi-translation switching possible
  // without re-running detection: the Control console's translation
  // switcher re-fetches this exact (book, chapter, verse) in the newly
  // chosen translation and re-pushes it — a plain reference lookup, not a
  // match. translation here is always whichever translation `text` is
  // CURRENTLY displayed in (updated on every switch), not necessarily the
  // church's default or the matching translation.
  translation: text("translation"),
  book: text("book"),
  chapter: integer("chapter"),
  verse: integer("verse"),
  mode: liveStateModeEnum("mode").notNull().default("content"),
  nextLabel: text("next_label"),
  nextText: text("next_text"),
  nextType: cueItemTypeEnum("next_type"),
  operatorMessage: text("operator_message"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const churchesRelations = relations(churches, ({ many }) => ({
  members: many(churchMembers),
  invites: many(churchInvites),
  services: many(services),
  songs: many(songs),
  announcements: many(announcements),
  customTexts: many(customTexts),
}));

export const servicesRelations = relations(services, ({ one, many }) => ({
  church: one(churches, { fields: [services.churchId], references: [churches.id] }),
  cueItems: many(cueItems),
  liveState: one(liveState, { fields: [services.id], references: [liveState.serviceId] }),
}));

export const cueItemsRelations = relations(cueItems, ({ one }) => ({
  service: one(services, { fields: [cueItems.serviceId], references: [services.id] }),
}));

export const songsRelations = relations(songs, ({ one, many }) => ({
  church: one(churches, { fields: [songs.churchId], references: [churches.id] }),
  sections: many(songSections),
}));

export const songSectionsRelations = relations(songSections, ({ one }) => ({
  song: one(songs, { fields: [songSections.songId], references: [songs.id] }),
}));

export const announcementsRelations = relations(announcements, ({ one, many }) => ({
  church: one(churches, { fields: [announcements.churchId], references: [churches.id] }),
  slides: many(announcementSlides),
}));

export const announcementSlidesRelations = relations(announcementSlides, ({ one }) => ({
  announcement: one(announcements, {
    fields: [announcementSlides.announcementId],
    references: [announcements.id],
  }),
}));

export const customTextsRelations = relations(customTexts, ({ one }) => ({
  church: one(churches, { fields: [customTexts.churchId], references: [churches.id] }),
}));

export const churchMembersRelations = relations(churchMembers, ({ one }) => ({
  church: one(churches, { fields: [churchMembers.churchId], references: [churches.id] }),
  profile: one(profiles, { fields: [churchMembers.userId], references: [profiles.id] }),
}));

export const churchInvitesRelations = relations(churchInvites, ({ one }) => ({
  church: one(churches, { fields: [churchInvites.churchId], references: [churches.id] }),
}));
