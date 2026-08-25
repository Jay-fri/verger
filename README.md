# Verger

A live scripture-detection tool for church media teams. See
[verger-project-overview.md](./verger-project-overview.md) for the full product spec.

This repo is at **Phase 9: multiple translations, switchable live**. Phase 0 (scaffolding), Phase 1
(auth, church accounts, roles, onboarding), Phase 2 (the Bible data layer), Phase 3 (the detection
engine), Phase 4 (the Control console UI), Phase 5 (the Content module), Phase 6 (realtime sync
between the Control console and a public Stage output route, pilotable in a real service via vMix's
Browser Source), Phase 6.5 (verse Previous/Next navigation + a quick-insert panel in the live output),
Phase 7 (real streaming transcription via AssemblyAI, replacing the mocked transcript feed), and
Phase 8 (a batch of competitive-audit features — session Auto/Manual display mode, a minimum-display-
time debounce, Clear/Black/Logo panic buttons, a Stage confidence monitor, operator-to-stage
messaging, order-of-service sections, saved song arrangements) are done. This phase adds more
public-domain translations (KJV, ASV, YLT, BSB, GNV, DRB, alongside WEB — 7 total) and a live
translation switcher in the Control console — see "Multiple translations, switchable live" below.

## Folder structure

```
verger/
├── apps/
│   └── web/                      # Next.js app (App Router, TypeScript) — the actual product
│       ├── src/app/dashboard/prep/     # Prep: create a service, add scripture/songs/announcements/custom text, reorder/remove
│       ├── src/app/dashboard/library/  # Content library: create/delete songs (+ sections), announcements (+ slides), custom text
│       ├── src/app/console/[serviceId]/ # Control console: three-pane operator screen (own top-level route, full-bleed — not the dashboard's centered layout); live output includes verse Previous/Next nav + a quick-insert panel; header runs the live AssemblyAI session (or a mock demo) — see use-live-transcription.ts
│       ├── src/app/stage/[serviceId]/  # Stage output: public, chrome-free, full-screen — what vMix's Browser Source points at
│       ├── src/app/                    # Also: sign-up/sign-in, onboarding, invite, dashboard, settings
│       ├── public/audio/pcm-worklet.js # AudioWorkletProcessor: mic Float32 -> 16-bit PCM for AssemblyAI's streaming API
│       ├── src/lib/db/           # Drizzle client + schema (churches, services, cue_items, songs, announcements, custom_texts, live_state, ...)
│       ├── src/lib/services/     # Service/cue-item CRUD (any content type), verse search, detection + live-state Server Actions, AssemblyAI token minting (transcription.ts)
│       ├── src/lib/library/      # Song/announcement/custom-text CRUD Server Actions
│       ├── src/lib/supabase/     # Supabase clients: browser, server (cookie-bound), proxy session refresh
│       ├── src/lib/auth/         # Session + church-membership + role-check helpers, auth Server Actions
│       ├── src/lib/invites/      # Invite generate/accept Server Actions
│       ├── src/lib/onboarding/   # Create-church Server Action
│       ├── src/components/       # Shared themed primitives (ui.tsx), VerseSearch, CueTypeBadge — all shared by Prep and Console
│       ├── src/proxy.ts          # Next.js 16 "proxy" (formerly middleware) — session refresh + auth gate
│       └── drizzle/              # Generated + custom SQL migrations (drizzle-kit)
├── packages/
│   ├── bible-data/                 # Indexed WEB/KJV/ASV/YLT translations (~31k verses each), exact-ref parser, pgvector semantic search
│   ├── detection-engine/           # Transcript-chunk -> scored match events; confidence scoring + auto-display/needs-review routing
│   └── shared-types/               # ChurchRole, invite status, translation list, role-hierarchy logic (+ tests)
└── infra/                          # Deploy/environment notes
```

`packages/bible-data` and `packages/detection-engine` are each self-contained — see their own
READMEs. Both have their own `.env.local` pointing at the same Supabase project as `apps/web`.

## Tech stack additions this phase

- **Supabase Auth** via `@supabase/ssr` — email/password + Google OAuth, cookie-based sessions (see
  "How sessions work" below)
- **Postgres Row Level Security** on every tenant table, as defense-in-depth for future direct
  client-side reads (e.g. Realtime) — see "Authorization model" below for where the *real*
  boundary is today
- **Vitest** — unit tests for the pure role-hierarchy logic (`pnpm test`)

## How sessions work

Sessions are Supabase's standard cookie-based SSR pattern, not anything custom:

- `src/proxy.ts` (Next.js 16's replacement for `middleware.ts`) runs on every request, calls
  `supabase.auth.getClaims()` (validates the JWT, transparently refreshes it if expired) and
  writes any refreshed token back to cookies. This is also the auth gate: logged-out visitors
  hitting a non-public route get redirected to `/sign-in?next=<path>`.
- `src/lib/supabase/server.ts` creates a fresh cookie-bound client per request for Server
  Components/Actions/Route Handlers — never a cached singleton, since each request has a
  different session cookie.
- `src/lib/supabase/client.ts` is the browser-side equivalent (`createBrowserClient`), needed
  once client-side Realtime subscriptions show up in a later phase.

## Authorization model

Two layers, deliberately:

1. **The real boundary — server-side role checks.** Every mutating Server Action
   (`src/lib/auth/actions.ts`, `src/lib/onboarding/actions.ts`, `src/lib/invites/actions.ts`) and
   every protected page re-derives the current user and their church role from the database on
   the server before doing anything. `requireActiveMembership()` in `src/lib/auth/membership.ts`
   is the shared entry point. The app talks to Postgres through Drizzle using a connection that
   owns the tables, which Postgres exempts from RLS by default — so RLS is *not* what's actually
   stopping a volunteer from hitting an admin action today.
2. **RLS — defense in depth for later.** All four new tables (`churches`, `church_members`,
   `church_invites`, `profiles`) have RLS enabled with real policies scoped to
   `auth.uid()`/church membership, so that when a future phase adds direct client-side Supabase
   queries (e.g. Realtime), they're safe by default instead of wide open. `church_invites` has
   zero policies for the `authenticated`/`anon` roles on purpose — invite tokens are bearer
   credentials, so direct-client reads are denied until there's an actual need for them.

Role hierarchy (`packages/shared-types`): **admin ⊇ operator ⊇ volunteer** — an admin passes any
operator- or volunteer-gated check, an operator passes volunteer-gated checks. `/dashboard/prep`
demonstrates a real operator-gated route (volunteers see an explicit "Access restricted" message,
not a client-side-hidden button).

## Bible data layer (Phase 2)

`packages/bible-data` is self-contained — see its own README for the full picture. Short version:

- Translations: **WEB, KJV, ASV, YLT** — all public domain, sourced from
  [bolls.life](https://bolls.life)'s API — chosen specifically to avoid licensing questions during
  development. A licensed modern translation (NIV, ESV, etc.) needs its own rights check with the
  publisher before production use. See "Multiple translations, switchable live" below for how WEB
  stays the one translation matching/detection runs against while the other three are display-only.
- Semantic search embeddings are generated **locally** (`Xenova/all-MiniLM-L6-v2` via
  `@huggingface/transformers`, runs on-device via ONNX) — no API key, no per-call cost.
- `resolveScripture(input)` is the function later phases (the detection engine) will call: exact
  reference parsing first, embedding-based semantic search as the fallback.

```bash
cd packages/bible-data
cp .env.example .env.local   # DATABASE_URL — same Supabase project as apps/web
pnpm db:generate && pnpm db:migrate
pnpm ingest   # ~31k verses, ~1-2 min
pnpm embed    # generates embeddings for every verse, resumable if interrupted
pnpm test     # includes 15+ fixture cases (exact refs + paraphrases) against the real data
```

## Detection engine (Phase 3)

`packages/detection-engine` consumes `packages/bible-data` and turns a stream of transcript chunks
into scored, routed match events. See its own README for the full picture. Short version:

- **Exact matches are always confidence 1.** Semantic matches start from cosine similarity and get
  boosted (and re-ranked) if they're in the session's Prep outline.
- **The auto-display threshold is a required config value, not a default** — this is the exact
  lever the overview doc calls out as the only thing a future solo mode would change to reuse this
  same engine.
- Output is an async generator (`detectFromTranscript`) — a stream in, a stream of events out —
  fed a static mock array today, ready to be fed a real STT source later without changing its
  interface.
- **Real finding from sanity-checking match quality**: a pure similarity floor can't perfectly
  separate "not scripture" from "a weak paraphrase" (their score ranges overlap), so some ordinary
  sermon banter surfaces as a low-confidence needs-review suggestion. It's safe — never crosses
  into auto-display — but not spotless. Full writeup in the package README.

```bash
cd packages/detection-engine
cp .env.example .env.local   # DATABASE_URL — same Supabase project as the other packages
pnpm test    # unit tests (confidence/router) + integration tests against real bible-data
pnpm demo    # pretty-printed run of a mock 10-sentence sermon against real data
```

## Control console UI (Phase 4)

`apps/web` now has the two operator-facing screens the rest of the app hangs off of:

- **Prep** (`/dashboard/prep`, operator/admin only) — create a service, search for verses (exact
  reference or paraphrase, via `@verger/bible-data`) and add them to an ordered outline, reorder
  with up/down, remove. This outline becomes the session's confidence-boost list.
- **Control console** (`/console/[serviceId]`, any role including volunteer) — the three-pane
  layout from the design direction doc:
  - **Order of service** (left) — click a cue item to push it live; active item highlighted gold.
  - **Live output** (center) — current item large, "Next" preview below it, anchored to the cue
    list independently of whatever AI detection is doing.
  - **AI detected** (right) — fed by `@verger/detection-engine` against the Phase 3 mock
    transcript, paced with a delay between chunks to simulate matches arriving live. Confidence is
    color only — sage for confident/auto-displayed, terracotta for needs-review — **no percentage
    is ever sent to the client**; the Server Action flattens the engine's raw similarity numbers
    out before the response leaves the server, not just at render time. One-tap confirm pushes a
    needs-review item live and flips it to sage. A manual search (same component as Prep's "add a
    verse") is a fallback that can push any verse live directly.
  - This is a genuinely full-bleed screen, not nested in the dashboard's centered layout — it has
    its own top-level route (`/console/[serviceId]`, not `/dashboard/console/[serviceId]`) since a
    three-pane operator console needs the full viewport, not a `max-w-4xl` column.
- **New tables**: `services` (a Prep outline/session, with `draft`/`live`/`ended` status) and
  `cue_items` (ordered verse cues), both church-scoped with the same RLS-is-defense-in-depth
  posture as Phase 1's tables.

This was verified with a real end-to-end browser walkthrough (sign up → create church → Prep →
search/add three verses → open console → run the mock session → confirm a needs-review item),
which caught and fixed one real bug: `VerseSearch` left the *previous* query's results (and their
clickable "Add"/"Push live" buttons) on screen for the whole round trip of a new search, so a
click during that window could silently act on the wrong verse. Fixed by clearing results the
moment a new search starts rather than waiting for it to resolve.

## Content module (Phase 5)

Songs, announcements, and custom text now live in the same ordered cue list as scripture — "one
shared runner," per the overview doc, not a separate system:

- **Content library** (`/dashboard/library`, operator/admin only) — church-scoped, reusable across
  services. Songs are a title plus ordered sections (Verse 1, Chorus, Bridge, ...); announcements
  are a title plus ordered slides; custom text is a single freeform slide.
- **`cue_items` is now polymorphic**: a `type` column (`verse` / `song_section` /
  `announcement_slide` / `custom_text`) plus the same `label`/`text` pair for every type — content
  is still cached at add-time rather than joined live (same tradeoff Phase 4 made for verses: a
  service's cue list shouldn't retroactively change if the library is edited later). Verse-specific
  columns (book/chapter/verse/translation) are now nullable, populated only when `type = "verse"`.
- **Prep's "Add content"** is a tabbed picker (Scripture / Songs / Announcements / Custom text) —
  scripture search is unchanged from Phase 4; songs/announcements pick from the library and add a
  specific section/slide; custom text can either reuse a library entry or be typed and cued in one
  step (it's meant for one-off use, so it doesn't force a trip to the Library page first).
- **The Control console's cue list** shows a small type badge per item (`VERSE`/`SONG`/
  `ANNOUNCEMENT`/`CUSTOM`) — deliberately neutral-colored text, not sage/terracotta/gold, since
  those colors are already reserved for AI confidence state and the live/active indicator; reusing
  them for content type would blur those meanings. Clicking any cue item — regardless of type —
  pushes it to Live Output through the exact same mechanism Phase 4 built for confirming an
  AI-detected verse.
- **AI detection genuinely interleaves with manual cue running**, verified live: with a song
  section pushed live and a mock detection session running in the background, manually clicking an
  announcement cue mid-session didn't pause or disrupt detection — a new auto-displayed match
  arrived moments later and correctly took over Live Output, while "Next" stayed correctly anchored
  to the manually-selected cue throughout.

## Realtime sync + Stage output (Phase 6)

The Control console and a new public Stage output route now stay in sync over Supabase Realtime,
across different devices/networks — the milestone where this app is pilotable in a real service
via vMix's Browser Source, ahead of the Electron NDI bridge.

- **Stage output** (`/stage/[serviceId]`) — bare, chrome-free, full-screen: no header, no panes, no
  operator chrome, just the current content centered in the warm ink/parchment palette at whatever
  size the browser source is set to (verified clean at 1920×1080). Shows a small dim "Verger"
  wordmark when nothing is live yet, rather than a blank screen that looks broken. **Deliberately
  public** — added to `proxy.ts`'s `PUBLIC_PATHS` and reads with no login check — because vMix's
  Browser Source can't carry an authenticated session. The service ID (an unguessable UUID in the
  URL) is the practical access boundary, the same trust model as a shared calendar/meeting link;
  the content itself (a verse, a lyric line, an announcement) isn't sensitive enough to warrant
  more than that.
- **New table, `live_state`** — one row per service, upserted every time the Control console pushes
  something live (cue click, AI confirm, AI auto-display, manual search push). This is the actual
  "publish" step — there's no separate broadcast call. **Postgres Changes** (not Broadcast) is what
  notices the write and pushes it to subscribed Stage tabs: with this app's realtime footprint (a
  handful of pushes per service, one or two subscribers), Postgres Changes' simplicity — no custom
  trigger function, no manual broadcast call to remember, automatically consistent with whatever's
  in the database — outweighs Broadcast's better scaling story, which matters at subscriber counts
  this app is nowhere near.
- **This is the one table in the app where `anon` genuinely needs RLS access**, not just
  defense-in-depth: the Stage page's realtime subscription connects directly from the browser with
  no Next.js server in the loop for that leg, so the `anon`-role SELECT policy on `live_state` (see
  `drizzle/0008_live_state_realtime_and_rls.sql`) is the actual, live-enforced authorization
  boundary for who receives updates — plus the table needed adding to the `supabase_realtime`
  publication, an easy-to-miss separate step from RLS.
- **Verified with two genuinely independent browser contexts** (separate cookie jars — the closest
  simulation available to "two different devices" without literally using two machines): an
  authenticated Control console in one, a Stage output tab with zero session/auth state in the
  other. Pushed two different verses live in sequence; both arrived at the unauthenticated tab via
  the open WebSocket with no page reload. One real timing lesson from testing this: a fresh
  subscription takes a moment to reach `SUBSCRIBED` before it starts receiving events (standard
  pub/sub behavior, not a bug) — the initial Server Component fetch already covers "what's live
  right now" for a normal page load, so this only matters in the sub-second window right as a Stage
  tab is first opening.
- **What I could verify vs. what still needs a real check**: I confirmed the page itself, the
  cross-context realtime sync, and clean rendering at 1080p. I do not have vMix available in this
  environment (a licensed Windows/Mac product) to literally add it as a Browser Source — that
  confirmation is the one item in this phase's ask I'm handing back to you.

## Live output verse navigation and quick-insert (Phase 6.5)

Two usability fixes to the Control console's live output, found by actually piloting Phase 6.

- **Previous/Next verse controls** — whenever the live output is a scripture verse (pushed from a
  cue, a search, or an AI-detected match), the Live output pane shows ← Previous verse / Next
  verse → buttons, plus left/right arrow-key shortcuts (ignored while an input/textarea/select has
  focus, so they don't fight normal text editing anywhere else in the console). Stepping walks the
  live `book`/`chapter`/`verse` one verse at a time via a new `getAdjacentVerse` lookup in
  `@verger/bible-data` (`packages/bible-data/src/resolve.ts`) — it rolls into the next/previous
  chapter at a chapter boundary (e.g. John 3:36 → John 4:1) but not across a book boundary, and this
  works for a single AI-detected or searched verse just as well as a cue pulled from a pre-built
  range, since it re-queries from wherever is currently live rather than replaying an original
  match's verse list. Each step is a normal `pushLive` call, so it updates Stage output the same way
  any other live push does.
- **Quick-insert panel** — a persistent area under the live output (`quick-insert-panel.tsx`) with
  Text / Song / Scripture tabs, for responding when the pastor goes off-script: type-and-push custom
  text, pick a song section from the church's library, or search-and-push a scripture reference —
  all pushed immediately, live. Crucially, quick-insert pushes never call `setActiveCueId`, so they
  override the live output without moving the highlighted item in the order-of-service cue list;
  when the live output isn't the active cue, a "Order of service paused at: `<cue>` · Resume" strip
  appears so the operator can get back with one click. Verified live: pushed a cue mid-list, pushed
  ad-hoc custom text over it, confirmed the cue list's highlight never moved, then resumed to the
  exact same cue.
- **New `live_state_source` value, `quick`** — added via `drizzle/0009_past_serpent_society.sql`
  (a plain `ALTER TYPE ... ADD VALUE`) so ad-hoc pushes are honestly labeled "Quick insert" in the
  live output pane rather than being misattributed to "search" or another existing source.
- Verified live end-to-end via Playwright against a real seeded service (three cue items, a library
  song, real WEB-translation verses) rather than just typecheck/build: pushed John 3:16 live, then
  stepped forward three verses and back two via both the buttons and the arrow keys, confirming
  Stage output tracked every step in realtime; then pushed a cue mid-list, overrode it with
  quick-insert text, confirmed on Stage output too, and resumed the original cue. No new automated
  tests beyond `getAdjacentVerse`'s chapter/book-boundary cases in
  `packages/bible-data/src/resolve.test.ts` — the two flows above are UI interaction sequences, not
  pure functions, so live browser verification is the honest check here, same reasoning as Phase 6.

## Live speech-to-text integration (Phase 7)

The mocked transcript array from Phase 3 is no longer what feeds the detection engine in normal
use — the Control console now runs a real streaming session against **AssemblyAI**
(`wss://streaming.assemblyai.com/v3/ws`), captures the operator's mic in the browser, and pushes
finalized transcript turns through the same `detectChunk` pipeline mock chunks used to go through.

- **Token minting stays server-side** (`src/lib/services/transcription.ts`,
  `mintAssemblyAiTokenAction`) — the real `ASSEMBLYAI_API_KEY` never reaches the browser. A
  short-lived, one-time-use token is minted fresh for every connection attempt, including
  reconnects, since AssemblyAI tokens are single-use by design. Gated behind
  `requireServiceAccess` so this can't be hit by a stranger to burn the church's quota.
- **Mic capture** (`public/audio/pcm-worklet.js` + `use-live-transcription.ts`) — an
  `AudioWorkletProcessor` converts the mic's Float32 samples to 16-bit PCM off the main thread, in
  ~100ms batches, over an `AudioContext` forced to 16kHz (matching what AssemblyAI's default PCM
  encoding expects) so no explicit resampling code was needed — the Web Audio API handles it once
  the context itself is at the target rate.
- **The whole session lifecycle lives in one hook**, `useLiveTranscription`
  (`src/app/console/[serviceId]/use-live-transcription.ts`), so `control-console.tsx` just renders a
  status and gets finalized turns via a callback. States: `requesting-mic` → `connecting` →
  `listening` → (on any unexpected close) `reconnecting` → back to `listening`, or `error` if
  retries run out. The mic stream and `AudioContext` are kept alive across reconnects — only the
  WebSocket itself is torn down and reopened — so recovering from a drop doesn't re-prompt for mic
  permission.
- **Reconnection**: any WebSocket close the app didn't itself request (network drop, an
  AssemblyAI-side disconnect, the service's 3-hour auto-close) triggers up to 6 retries with
  backoff (1s → 30s) before giving up and surfacing a clear, dismissable error — this is the "a
  dropped connection mid-service should not crash the console" requirement. One deliberate
  exception: a missing/invalid `ASSEMBLYAI_API_KEY` is detected as a config problem (not a
  transient blip) and fails immediately instead of burning through the retry backoff first, so
  the real cause shows up right away instead of after ~1 minute of pointless retries — verified
  live (see below).
- **Usage/cost awareness**: since AssemblyAI bills by WebSocket connection duration (not audio
  volume), a live "Listening · MM:SS (~$X.XX)" readout in the console header — at the confirmed
  ~$0.01/minute rate from the overview doc — is an accurate cost proxy, not just a vanity timer.
  `console.info` logs a checkpoint every full minute, plus the authoritative
  `audio_duration_seconds`/`session_duration_seconds` AssemblyAI itself reports whenever a
  connection segment ends (visible in the browser console for after-the-fact review).
- **The mock-transcript demo path was kept**, deliberately, as a secondary "or run mock demo"
  text link — de-emphasized, disabled while a live session is running, and vice versa. This
  wasn't asked for explicitly; I judged that a media team rehearsing or training a new volunteer
  without spending AssemblyAI credits or needing a quiet room is a real, low-risk use case worth
  keeping working code around for, rather than deleting a tested feature. Happy to remove it if
  that's not wanted.
- **Initial verification, before a real key existed**: mic capture + `AudioWorklet` setup
  succeeds and doesn't crash the console; the missing-API-key path fails fast with a clear error
  and a working "Retry" button instead of hanging or crashing; the mock-demo path still
  auto-displayed and queued matches correctly. All via Playwright with Chromium's fake-mic device,
  no real AssemblyAI account yet.

### Real-world bugs found while piloting, and the fixes

Once a real `ASSEMBLYAI_API_KEY` was in place and this got piloted for real, two rounds of bugs
showed up — **matches were being silently dropped**, and detection was **noticeably slow, or
missed things entirely** ("the pastor calls out a scripture and it's slow to bring it up, or
doesn't get it at all"). Both rounds were root-caused by re-reading the actual pipeline rather than
guessing, then confirmed fixed against the real AssemblyAI API (synthesized speech via macOS
`say`, fed into Chromium as a fake microphone device — see "How this was verified" below).

**Round 1 — dropped matches and stalled turns:**

- **One match per chunk, period.** `findReference()` only ever returned the *leftmost* reference in
  a piece of text, and `detectChunk()` only ever returned one `DetectionEvent`. The Phase 3 mock
  transcript was deliberately written one-reference-per-chunk, so this never showed up until real
  speech, where a single AssemblyAI "turn" routinely contains more than one reference. **Fix**:
  `detectChunkEvents()` (`packages/detection-engine/src/detect.ts`) returns every exact reference
  in a chunk; `detectChunk()` is now a first-match convenience wrapper over it.
- **A turn that never finalizes never got checked at all** — AssemblyAI only finalizes a "turn" at
  a natural pause, and detection only ran on `end_of_turn`. Superseded by Round 2's partial-
  transcript matching below (this no longer waits for a stall at all).
- **The local embedding model's one-time load cost** (via `@huggingface/transformers`) made the
  *first* paraphrase match of a session noticeably slower than every match after it. **Fix**:
  `warmUpDetectionAction` fires once when the Control console mounts.

**Round 2 — the parser didn't understand *spoken* references, and detection waited too long:**

- **The reference parser expected written citations, not speech.** `findReference`/
  `findAllReferences` were built around "John 3:16" — digits, a colon, book immediately adjacent to
  chapter/verse. Real spoken sermons say "chapter three, verse sixteen" (number *words*), spread
  the book/chapter/verse across a sentence ("the book of Romans, chapter eight, and let's look at
  verse twenty eight"), and sometimes state a verse with no chapter restated at all a few seconds
  after the chapter was said. **Fix**: `packages/bible-data/src/reference-parser.ts` was rewritten
  around a token-scanning approach: `normalizeSpokenNumbers()` converts number words to digits
  (grammar-aware — "Romans eight twenty-eight" reads as chapter 8, verse 28, not a nonsense sum of
  8+20+8), and `findAllReferences(text, context?)` walks the transcript handling book-then-chapter-
  then-verse in any reasonable spoken ordering, verse-before-chapter ("verse 28 of chapter 8"), a
  verse stated well after its chapter in the same sentence, and a bare "verse N" resolved against
  a `{ book, chapter }` context — either established earlier in the same chunk, or carried forward
  from a *previous* transcript chunk (`control-console.tsx` keeps this in `referenceContextRef`,
  with a 45s TTL so a stale context from several sentences ago can't mis-resolve something
  unrelated, like a song's own "verse 2"). 22 realistic spoken-style fixtures were written and
  verified before touching anything downstream (`reference-parser.test.ts`).
- **A bare chapter mention ("Romans chapter 8", verse not yet said) still needs to produce
  *something*** — for the context-carry case above to work, the chapter has to be tracked even
  before its verse arrives. But naively auto-displaying it (exact matches are always confidence 1)
  would flash a guessed verse 1 on the screen the instant a chapter is named, which is wrong when —
  the common case — a specific verse is about to follow. **Fix**: `findAllReferences` still emits a
  whole-chapter reference (flagged `isWholeChapter: true`), but `detectChunkEvents` always routes
  it to `needs-review` regardless of its confidence, never `auto-display`. Verified live: a
  "Romans 8" (needs-review) entry appeared and sat harmlessly in the queue for a moment before the
  real "Romans 8:28" (auto-display) landed once the verse was heard — never the wrong content live
  on Stage output.
- **Detection wasn't checking partial transcripts at all** — only finalized turns, so anything said
  was invisible until AssemblyAI's endpointing decided the turn was over (routinely a second or
  more after the words were actually said). **Fix**: `use-live-transcription.ts` now checks growing
  partial transcripts too, throttled to every ~1.5s (`PARTIAL_CHECK_INTERVAL_MS`), not just at
  `end_of_turn` — safe specifically *because* of the whole-chapter fix above, which is what stops an
  incomplete "...chapter 3..." partial from ever flashing something wrong before the verse number
  arrives. A `book:chapter:verse` dedup set per turn (`seenInCurrentTurnRef`) stops the same verse
  from being re-announced as the partial keeps growing into the eventual final.
- **Exact-before-semantic was already correctly ordered** (`detectChunkEvents` returns early on any
  exact match, never running the embedding-based semantic search in that case) — confirmed, not a
  bug, and now provable from the logging below rather than reading the code and hoping.
- **Two genuinely new bugs surfaced by live testing itself, not by re-reading code:**
  - **Audio was silently dropped during connection setup.** The token-mint + WebSocket-handshake
    window took ~5 real seconds in testing; the AudioWorklet was already capturing mic audio during
    that window (via `getUserMedia`, which starts immediately), but every frame was discarded
    because the send path only fired `if (ws.readyState === WebSocket.OPEN)`. Confirmed directly: a
    live test's first transcript began mid-sentence ("...28, we know that all things work
    together...") — everything the synthesized voice said in roughly the first 5 seconds
    ("Good morning church, please turn with me to the book of Romans, chapter eight, and let's look
    at verse twenty...") was simply never sent. **Fix**: `pendingAudioRef` now buffers frames
    (capped ~15s) whenever the socket isn't open — initial connect *or* a reconnect gap — and
    flushes them the moment `ws.onopen` fires. Re-ran the same test after the fix: the WS log shows
    "flushing 42 buffered audio frame(s)," and the first transcript now genuinely starts at "Good
    morning, church."
  - **Overlapping, unawaited detection calls queued up behind each other.** Checking partials every
    1.5s without waiting for the previous check to resolve meant several requests could be in
    flight at once; round trips measured 5-8 seconds even though the server reported doing its own
    work in under 1.5s each time — the gap was queuing, not detection. **Fix**: `processingChunkRef`
    in `control-console.tsx` skips a new *partial* check while one is already in flight (finals are
    never skipped) — the next partial 1.5s later, or the eventual final, catches up regardless.
    Re-verified: round trips dropped to 1.4-2.5s, tracking the server-reported time much more
    closely.
- **AssemblyAI configuration**: `format_turns=true` is now set (AssemblyAI punctuates/capitalizes
  finalized turns — partials are still never formatted regardless, which is exactly why the
  parser's own spoken-number handling above still matters) and `keyterms_prompt` word-boosts
  transcription toward all 66 canonical Bible book names (AssemblyAI's 100-term cap, computed
  server-side in `transcription.ts` and handed to the client alongside the token — kept out of the
  client bundle specifically so it doesn't re-trigger the `@verger/bible-data` barrel-import
  client-bundle issue from Phase 6/7's `live-state.ts`/`embedText` history).
- **Latency and rejection logging, for real tuning later**: `detectChunkEvents` logs
  `match-start`/`match-done` with elapsed ms, and a line for *every* rejected candidate — an exact
  reference that parsed but matched zero verses, a semantic candidate below the similarity floor,
  an alternative that lost to a better one, or a best candidate that didn't clear the auto-display
  threshold — all server-side only (`console.info`, never reaches the browser or any UI, consistent
  with the "no numeric confidence in the UI" rule, which is about what the *operator/congregation*
  sees, not server logs). The client (`control-console.tsx`) logs its own trace — chunk received,
  round trip, stage-sync — correlated to the server logs by chunk text/timing rather than a shared
  trace ID, since there's no distributed tracing infrastructure in this app and building one wasn't
  warranted for a single-process pair.

**How this was verified**: `say` synthesized ~19s of continuous, natural spoken sermon audio
(mixing two exact references cited with real spoken phrasing, a verbatim quote, and a deliberately
loose/borderline paraphrase), converted to 16kHz mono PCM WAV via `afconvert`, fed into Chromium via
`--use-file-for-fake-audio-capture` against the *real* AssemblyAI streaming endpoint — not mocked,
not simulated. Confirmed live: both exact references (Romans 8:28, John 3:16) auto-displayed
correctly and promptly; the borderline paraphrase landed in needs-review as Romans 8:1, with its
full rejected-candidate list visible in the server log; the transient "Romans 8" (needs-review)
entry appeared and was superseded cleanly once the real verse arrived; round-trip latency dropped
from 5-8s to 1.4-2.5s after the concurrency fix; and the connection-setup audio-buffering fix was
directly observed closing a real gap where several real seconds of speech had been silently
discarded. Package test suites: 127 tests total (up from 96), including 22 new spoken-style
reference fixtures and 6 `normalizeSpokenNumbers` unit tests. All QA accounts/services created for
this were cleaned up via direct SQL afterward, same as every other phase.

### Chapter-only references and scoped semantic search

Reported gap: "like in 2 Corinthians 6 where Timothy said..." produced no scripture at all. Two
related fixes, both in `packages/detection-engine/src/detect.ts` and
`packages/bible-data/src/reference-parser.ts` / `semantic-search.ts`:

- **Chapter-only references now produce a usable fallback instead of being silently discarded.**
  `findAllReferences` already parsed "2 Corinthians 6" as a whole-chapter reference
  (`isWholeChapter: true`, from Phase 7's earlier fix) — this part was already working. What wasn't:
  finding it made `detectChunkEvents` return immediately with just the chapter's opening verse
  (`2CO 6:1`, needs-review), never attempting anything smarter with the rest of the sentence.
- **A chapter-only (or book-only) reference now scopes semantic search instead of blocking it.**
  When the exact path finds *only* whole-chapter/book references (no specific verse), it no longer
  short-circuits — it uses that partial reference to restrict `semanticSearch` to just the named
  chapter (or, with no chapter, the whole book) before ranking candidates, then tries that first.
  `semanticSearch` gained a `scope?: { book, chapter? }` param (a plain `and(eq(book), eq(chapter))`
  addition to its `WHERE` clause) for this. If the scoped search finds something that clears the
  similarity floor, that's what gets returned; if not, the chapter-only fallback (verse 1,
  needs-review) is still what comes back — never nothing. The exact piloting example now resolves
  correctly: "2 Corinthians 6" + "we shouldn't be unequally yoked with unbelievers" → **2 Corinthians
  6:14**, not just 6:1.
- **Scoping doesn't change any verse's own similarity score** (that's fixed by the embeddings
  alone) — what it changes is which verses are even in the running. A paraphrase's cosine similarity
  to the *correct* verse is identical whether searched against 18 verses or 31,000; scoping just
  stops an unrelated, higher-scoring verse from a different book crowding out the right one within
  the top-N results. Verified directly: "put on the new self and get rid of your old sinful ways"
  picks a wrong verse from a different book entirely when searched unscoped, but correctly lands in
  Ephesians 4 once scoped to the chapter the pastor had just named.
- **A real bug found via the test suite, not code review**: the book abbreviation "Act" (for Acts)
  collided with the ordinary English word "act" — "...as an **act** of worship" mid-sentence was
  silently re-matched as a fresh mention of the book of Acts, overwriting the correctly-tracked
  `{Romans, 12}` context with `{Acts, null}` and scoping a search to the wrong book with no visible
  error. Fixed by excluding a small set of single-token abbreviations that are also common standalone
  English words ("Is" for Isaiah, "Am" for Amos, "Act" for Acts) from the spoken scanner specifically
  — real speech essentially never abbreviates a book this tersely out loud, that's a written-citation
  convention. The typed manual-search box (`parseReference`) is unaffected; it can still resolve a
  deliberately-typed "Is 40:1".
- **Not a guarantee, by design**: some paraphrases are too indirect to resolve confidently even
  scoped to the right chapter. In that case the chapter-only fallback from the first fix still
  applies — verified directly with a real paraphrase ("give everything you have back to God as your
  worship") that a full-Bible search confidently (and wrongly) resolves to an unrelated book, while
  the Romans-12-scoped search correctly finds nothing usable and falls back to `Romans 12:1`
  (needs-review) rather than guessing.
- **Verified against 8 realistic partial-reference-plus-paraphrase examples** (Ephesians 6 armor of
  God, James 1 "count it all joy", Philippians 2's kenosis passage, Romans 12's living sacrifice, a
  book-only Ephesians mention, plus the three scoped-vs-unscoped comparisons above) — all resolving
  to their correct, real, verified verse against the actual embedded WEB text, the same empirical
  verification standard as the rest of this package's test suite. 140 tests total (up from 127).

### Three bugs from a real live-test session: a frozen partial, unconditional latency, and non-determinism

A real piloting session produced latency/rejection logs showing three concrete problems. All three
turned out to trace back to related causes, diagnosed empirically (raw payload logging, per-stage
timing, and repeated-call probes against the real database) before writing any fix.

**Bug 1 — partial transcript appeared frozen for 49 seconds.** The reported symptom (15 consecutive
partial events logging identical text) needed one question answered first: is AssemblyAI itself
re-sending the same content, or is our own handling stuck? `use-live-transcription.ts` now logs the
**raw WebSocket payload** (`[assemblyai:raw] #<seq> @<timestamp> <raw JSON>`) completely independently
of any processed state — no parsing, no counters, just the bytes as received. A real test recording
(74s of continuous, distinct synthesized speech, not one repeated phrase) proved AssemblyAI's own
`transcript` field growing turn over turn exactly as expected:

```
#2  "Good morning, church."
#3  "Good morning, church family! Let's open in prayer before we get started today. Thank you, Lord, for this"
#4  "...Thank you, Lord, for this new day and for bringing"
#5  "...for bringing us together as one body."
#6  (end_of_turn) "...us together as one body."
```

So in this run the wire was never actually stalled — but the investigation surfaced a real, separate
reliability risk worth closing defensively: the capture-side `AudioWorkletNode` was never connected to
`audioContext.destination`. Chrome's Web Audio graph is pull-based from the destination outward, and a
node with no path to destination has no hard guarantee it keeps being scheduled, particularly once a
tab backgrounds — a very plausible explanation for a real stall that this test run didn't happen to
reproduce. Fixed by routing the worklet through a zero-gain (silent) `GainNode` to destination, keeping
it on an actively-pulled path without adding the mic's own audio back into the page. Also added
`[audio-flow]` counters (frames produced by the worklet vs. frames actually sent over the WebSocket,
logged every 5s) so a future stall report can show which side of the pipeline actually stopped, and a
guard that skips re-running detection when a partial's text is byte-for-byte unchanged since the last
check — real proof from this same test run that AssemblyAI *does* sometimes re-send identical partial
content mid-turn (payloads #20 and #21 above were identical, 432ms apart), which used to mean a
redundant trip through the whole matching pipeline for no new information.

**Bug 2 — every chunk cost 870ms–2500ms of server processing, even for plain announcements.** Profiling
(new `[timing]` log lines around every stage — reference parsing, the exact-match DB lookup, the
embedding call, and the semantic DB query, each timed separately) confirmed the *logic* was already
correct: semantic search only ever runs when the exact-match path finds nothing (a hard early return in
`detectChunkEvents`). The cost was real, just mischaracterized — it's DB/network round-trip time, not
semantic search running unconditionally. Real numbers from the corrected test run:

| stage | n | min | max | avg |
|---|---|---|---|---|
| reference parsing (no DB, in-process) | 33 | 0.10ms | 1.40ms | 0.37ms |
| exact-match DB lookup | 19 | 296ms | 1680ms | 502ms |
| semantic DB query (warm) | 13 | 323ms | 405ms | 356ms |
| semantic DB query (cold start) | 1 | — | 8524ms | — |

Reference parsing is free, as expected. Exact-match and semantic-search paths are cleanly separated —
neither ever both ran for the same chunk. The one 8.5s outlier was the very first semantic call of a
fresh server process (embedding model + Postgres connection pool + HNSW index pages all cold at once);
every later semantic call in the same run stayed under 410ms. The remaining ~300ms baseline on exact
matches is dominated by this sandboxed environment's network round-trip to Supabase (~150-160ms
measured directly via a bare `SELECT 1`), not query cost — the underlying lookup itself is a single
indexed row fetch. One genuinely avoidable cost was found and fixed: `detectAgainstOutline` was
re-querying the service's cue outline from the database on **every single chunk**, even though it
rarely changes mid-service. `apps/web/src/lib/services/detection.ts` now caches it in-process per
service with a 30-second TTL, cutting one full DB round trip off of every chunk after the first.

**Bug 3 — identical input produced "1 match(es)" then "0 match(es)" with no code change.** Direct
repeated-call probes against the real database settled this immediately: `detectChunkEvents` is fully
deterministic — five consecutive calls with identical text *and* identical `referenceContext` produced
byte-for-byte identical results, on both the exact-match path (`ROM 8:28`, 5/5) and the semantic path
(`PHP 4:13`, confidence `0.8448`, 5/5). Varying only `referenceContext` for the same text, however,
does change the result — which is exactly the behavior a 45-second context TTL produces once a session
stalls long enough (Bug 1) for that TTL to expire mid-conversation: the *same words*, scoped differently
depending on when in the stall they got (re-)processed, look indistinguishable from "random" in a
latency log that only shows match counts. Bug 3 was downstream of Bug 1, not an independent source of
non-determinism — fixing the stall risk and adding the unchanged-text skip (Bug 1's fixes) removes the
condition that let context drift produce different-looking results for what was really the same input
processed at different, uncontrolled times.

**One more real bug found live-testing these fixes, same class as the "act" collision above:** the
common English word "job" ("my job was uncertain...") matched the book of Job — Job's only alias besides
its own full name is the abbreviation "Jb", so unlike Isaiah/Amos/Acts there's no less-collision-prone
alternative name to fall back on. Excluded from the spoken scanner the same way, accepting the same
tradeoff (a pastor saying "the book of Job" by name won't register via the spoken scanner — same
limitation the "Is"/"Am"/"Act" exclusions already accept). `packages/bible-data`: 95 tests passing (up
from 94); `packages/detection-engine`: 38 tests passing, unchanged.

### "Frozen matcher input" bug report — turned out to be a parser gap, not a truncation

A follow-up report described a match that never fired: raw AssemblyAI payloads showed the transcript
growing to include "Ephesians chapter number 5, verse number 17," but every `[latency]` log line for
that turn showed the same ~70-character snippet and `0 match(es)`, even once the reference was clearly
present. The natural suspicion — a fixed-length slice capping what actually gets matched — turned out to
be a red herring, confirmed by tracing the two places any `.slice(0, N)` exists in this whole path:
`control-console.tsx`'s `[latency]` log line (`text.slice(0, 70)`, display only) and `detect.ts`'s
`[detection]` log line (`chunk.text.slice(0, 100)`, also display only). Neither touches the value
actually passed to `findAllReferences`/`embedText` — that's always the full, untruncated turn text. A
direct probe against the real matcher proved it: as a simulated turn grows from 70 to 141 characters
across six partials, the logged matcher input length grows in step every time, and the moment the
reference completes it fires — **`EPH 5:17 (auto-display)`** — while a client-side display log using the
70-char slice would still show the same frozen preamble throughout (that display behavior is correct and
unrelated to matching).

The real bug was in `findAllReferences` (`packages/bible-data/src/reference-parser.ts`): the scanner
required a digit immediately after the words "chapter" and "verse" ("chapter 5", "verse 17"). A
formal/dictation-style phrasing with a filler word — "chapter **number** 5, verse **number** 17" — put a
non-digit token where the scanner expected one, so neither the chapter nor the verse was ever recognized
and the reference was invisible to the parser regardless of how long the surrounding transcript grew.
Fixed with a small `skipFillerNumber` helper that optionally skips one "number" token before checking
for the digit, applied everywhere a chapter or verse digit is expected (including the verse-first "verse
N of chapter M" ordering). Two regression tests added, both empirically verified against the real parser
before being locked in: the exact reported phrasing after a long preamble, and the verse-first ordering
with both digits fillered. `packages/bible-data`: 97 tests passing (up from 95).

## Competitive-audit features (Phase 8)

Seven items from the "Feature audit and competitive mapping" section of `verger-project-overview.md`
(PewBeam, ProPresenter, EasyWorship, Proclaim) — Session-level Auto/Manual display mode, a minimum
display-time debounce, Clear/Black/Logo panic buttons, a Stage confidence monitor, operator → stage
messaging, order-of-service sections, and saved song arrangements.

**Session-level Auto/Manual display mode.** A per-service toggle (`services.display_mode`), chosen while
a session is idle and locked once it starts. Doesn't touch the detection engine's confidence math at all
— `detectAgainstOutline` still computes the same `decision` (auto-display/needs-review) it always did, so
the AI Detected queue's sage/terracotta coloring is identical in both modes, exactly as specified ("still
show confidence coloring... since it's informational either way"). What changes is purely whether
`recordMatch` is *allowed* to act on an auto-display decision: in Manual mode every match — regardless of
confidence — lands in the queue for a one-tap Confirm, never auto-pushed. A new `autoDisplayed` flag on
each queue entry (separate from its confidence `status`) drives whether the UI shows "Auto-displayed" or
Confirm/Dismiss buttons, so a confident-but-not-yet-displayed entry (Manual mode, or debounced — see
below) still gets a one-tap path to the screen. Verified live: with Manual mode selected, running the
mock demo left "Nothing live yet." on screen for the full run while three matches (two John 3:16, one
Titus 3:15) queued up with correct sage/terracotta coloring; tapping Confirm on one pushed it live
immediately.

**Minimum display time (debounce).** `MIN_DISPLAY_TIME_MS` (3500ms, a top-level tunable in
`control-console.tsx`, the same pattern as `CHUNK_DELAY_MS`/`PARTIAL_CHECK_INTERVAL_MS`). `pushLive` — the
one function every live-output write goes through — stamps `lastPushedAtRef` on every push, from any
source. Only the automatic path in `recordMatch` checks it: an auto-display decision within the window
is suppressed (logged, not dropped — it still lands in the queue with `autoDisplayed: false`, so the
operator can force it through immediately with one tap, since operator actions always bypass the
debounce). Live proof (mock demo, real console log lines):
```
@7865ms:  [debounce] suppressed auto-display of John 3:16 — 1076ms left on minimum display window
@16844ms: [debounce] suppressed auto-display of Philippians 4:13 — 282ms left on minimum display window
```
Both verses had already auto-displayed once each shortly before (John 3:16 at 5768ms, Romans 8:28 at
13853ms) — the second line is the exact flicker scenario the debounce exists to prevent: Philippians 4:13
tried to replace Romans 8:28 only ~3.0s after it went up, 282ms short of the 3.5s minimum, and was held
back rather than flickering straight over it. (The mock demo's default 2.5s chunk cadence, it turns out,
is usually *slower* than the 3.5s window on its own once round-trip time is added — a real live session's
1.5s partial-transcript re-check cadence is the case this debounce actually protects continuously; the
mock demo's `CHUNK_DELAY_MS` was temporarily dropped to 800ms to get a deterministic repro, then reverted.)

**Clear/Black/Logo panic buttons.** Always-visible in the Live output pane header, backed by a new
`live_state.mode` column (`content`/`clear`/`black`/`logo`) that's deliberately independent of the
content columns (label/text/source/type) — a panic push never overwrites them, so "Clear (blank the text
but keep any background)" is literally true in this data model: nothing about the underlying row changes,
only how Stage output renders it. `setLiveStateModeAction` touches only `mode` (a minimal
`onConflictDoUpdate` — see its doc comment), and is called directly from the panic-button handlers,
bypassing `pushLive`/the debounce entirely, per spec ("an emergency override, not a normal content
change"). Logo reads `churches.logo_data_url` — a plain `data:` URL, not a Storage bucket (a deliberate
simplification: no manual Supabase dashboard bucket-creation step, at the cost of a ~500KB practical size
cap, enforced both client-side in the upload form and server-side in `updateChurchLogoAction`). Verified
live end to end: pushed a real verse live, opened the audience Stage output in a second tab showing it,
then Black (solid `#000`), Clear (blank, themed background — deliberately distinct from Black, and from
the "no session yet" placeholder too), Logo (a real uploaded test image rendered centered), and finally a
normal cue push to confirm it resumes cleanly. All four states screenshotted against the live Stage tab.

**Stage confidence monitor.** A second public route, `/monitor/[serviceId]` (added to `proxy.ts`'s
`PUBLIC_PATHS` — same "public if you know the service ID" trust model as `/stage`), sharing the *same*
`live_state` table and Realtime channel as the audience Stage output rather than standing up a parallel
one. Shows current content, the next order-of-service item, and the operator message (below) — styled as
a dense, small-text, monospace utility screen, deliberately distinct from Stage output's large centered
broadcast-style text, since nobody's pointing a camera at it. "Next" is denormalized onto
`live_state.next_label`/`next_text`/`next_type` at write time (same content-caching philosophy as
`cue_items` itself), computed and sent by `pushCueLive` whenever the active cue changes — every other
push type (quick-insert, search, AI) omits those fields entirely, which (via `setLiveStateAction`'s
partial-update behavior) leaves the monitor's "Next" untouched, since only actual order-of-service
position determines what's next, not whatever happens to be live at the moment.

**Operator → stage messaging.** A text field in the Live output pane, `live_state.operator_message` (Send/
Clear, no history — a fresh `setOperatorMessageAction` call fully replaces whatever was there). Rendered
only by the monitor; `stage-display.tsx`'s `StageState` type deliberately omits the field entirely, so
there's no code path by which it could leak onto the audience output. Verified live: sent a message from
the console, watched it appear in the monitor's amber message panel within ~1-2s.

**Order of service sections.** `cue_items.section` (`pre_service`/`warm_up`/`service`/`post_service`,
Proclaim's four-part model), with a single global `position` counter across all sections — sorting by
(fixed section order, then position) produces correct per-section ordering without needing per-section
position resets (see `sortBySectionThenPosition`/`groupBySection`/`computeNextCue` in
`lib/services/cue-sections.ts`). Prep's outline editor and the Control console's cue list both render four
labeled, independently-orderable sections; `moveCueItemAction`'s up/down neighbor search is scoped to
`current.section`, so reordering never crosses section boundaries. Pre-service and Post-service are
tagged "Loops" in the UI: `computeNextCue` wraps Next back to a looping section's own first item once its
last item is reached, instead of falling through into the next section — deliberately scoped to
*navigation wrap-around* only this round, not an auto-advancing timed slideshow (that would overlap with
the separate, not-yet-built "Countdown/elapsed timers" feature). Verified live: with two Pre-service
items, activating the second (last) one showed the *first* one as "Next" — confirmed via screenshot,
cue-list highlighting and the Live output pane's Next card both correct.

**Saved song arrangements.** Genuinely not there before this phase — confirmed via investigation, not
assumed: the content module only ever supported adding one song section to an outline at a time, with no
concept of a reusable order surviving between services. Added `songs.last_arrangement` (a `text[]` of
`song_section` IDs) plus `cue_items.song_section_id` (nullable, `onDelete: "set null"`, so deleting a
library section doesn't retroactively break a past service's cached cue). `syncSongArrangement()`
recomputes and re-saves a song's arrangement from whatever's *currently* in a given service's cue list
after every add, remove, or reorder that touches one of its sections — always reflects the most
recently-touched service, not necessarily the most recently-created one. A new "Reuse last arrangement (N
sections)" button in Prep's song picker adds every section in one step, in that saved order (falling back
to raw section order if the song has never been arranged yet). Verified live end to end across two
separate services: built "Great Is Thy Faithfulness" as Verse 1 → Chorus in service A (confirmed
`last_arrangement` persisted in that exact order); in a brand-new service B, the picker offered "Reuse
last arrangement (2 sections)" and adding it produced Verse 1 → Chorus, not all three of the song's
sections and not a different order.

### Two real bugs found live-testing this phase

**Postgres Changes realtime payloads use the raw database column names, not Drizzle's camelCase.** The
monitor's realtime handler read `row.nextLabel`/`row.nextText`/`row.operatorMessage` — camelCase, matching
`getLiveState`'s Drizzle-mapped return type — but a `postgres_changes` payload comes straight off the
replication stream with no ORM in the loop, so the actual keys are `next_label`/`next_text`/
`operator_message`. The mismatch failed silent: `row.nextLabel ?? null` just quietly became `null`, no
error, no warning. `text`/`label`/`mode` "worked" the whole time by pure accident — they're single-word
columns, so snake_case and camelCase happen to be identical. First reproduced live: sending an operator
message made the monitor's "Next" card revert to "End of outline." even though the database still had the
correct `next_text` the entire time (confirmed by direct query) — the bug was 100% client-side. Fixed by
reading the payload's real snake_case keys directly.

**A `flex-1` layout bug on the confidence monitor pushed the operator message off-screen with no way to
scroll to it.** The "Now" card was `flex-1` (grow to fill all remaining space) in a `flex flex-col
h-screen` column; a short "Now" text left a large empty gap that *was* the remaining space, so `flex-1`
consumed nearly the whole screen height and pushed the "Next" card and the operator-message panel below
the visible viewport — on a screen meant to run unattended and unscrolled. Caught by literally looking at
the live-tested screenshot and finding the amber message panel simply wasn't there. Fixed by capping
"Now" to `flex-3` (still the largest section, but bounded) with `overflow-y-auto` for genuinely long
content, and `shrink-0` on the header/Next/message sections so they're never squeezed to zero regardless
of viewport height.

## Multiple translations, switchable live (Phase 9)

**Three more public-domain translations, alongside WEB**: KJV (King James Version, 1769), ASV (American
Standard Version, 1901), and YLT (Young's Literal Translation, 1898) — all ingested from bolls.life the
same way WEB was, via a now-generalized `pnpm ingest <CODE>` (`packages/bible-data/src/ingest/`,
`fetch-web.ts` renamed to `fetch-translation.ts` since it's no longer WEB-specific). `verses.translation`
already had no schema barrier to this (a plain `text` column, unique on `(translation, book, chapter,
verse)`) — the actual gap was entirely in `apps/web`, which never threaded any translation choice into
the Bible data layer's already-translation-aware functions at all. **As with WEB, these three are public
domain, which is exactly why they were chosen — a licensed modern translation (NIV, ESV, NASB, NLT, CSB,
etc.) still needs its own rights/licensing check with the publisher before it could be added; bolls.life
happens to serve those too for its own app, but that's not a redistribution license for this one.** See
`BIBLE_TRANSLATIONS` in `packages/shared-types` for the enforced list.

**A real data-quality bug found ingesting KJV/ASV**: bolls.life serves both with inline Strong's-number
annotations (`<S>1063</S>`) and footnotes (`<sup>...</sup>`) baked into the verse text. The existing
`cleanText()` only stripped tag *delimiters*, not their content, so numbers were left glued directly onto
the preceding word with no space — every single word in the verse, not an edge case: `"For1063 God2316 so
3779 loved25 the world2889"`. Fixed by stripping `<S>...</S>` and `<sup>...</sup>` as whole spans
(delimiters *and* content) before the generic tag-strip pass, which still correctly keeps inner text for
WEB's occasional `<b>` formatting tags. Verified against the full ingested dataset, not just a spot check:
zero rows in either translation still match `/[a-zA-Z]\d/` (a letter immediately followed by a digit —
the exact shape of the bug). A second, much smaller quirk: YLT's book list names Psalms "Psalm" (singular)
where every other translation says "Psalms" — the book-order sanity check that guards against bolls.life
ever silently reordering books was tightened to fold that kind of pluralization difference rather than
fail on it, without weakening what it's actually protecting against (book *order*, via `bookid` — the name
was always just a human-readable cross-check on top of that).

**Matching (detection + semantic search) stays on exactly one translation, always — WEB.** It's the only
one with embeddings (`run-embed.ts` is now explicitly scoped to it, so a future re-run never wastes ~31k
vectors per translation embedding rows nothing ever queries), so semantic search has no other option, and
exact-match stays on the same one for consistency: a match's confidence never depends on which translation
happens to be selected for display. `detectChunkEvents` itself (`packages/detection-engine`) needed **zero
changes** — it already returned every match as a canonical `(book, chapter, verse)` reference plus
matching-translation text, exactly the shape this needed.

**Displaying a match is a completely separate, decoupled lookup, keyed by that reference.** Both
`detectAgainstOutline` (detection) and `searchVersesAction` (manual search) now do a second pass after
matching: for each result, if the caller's requested `displayTranslation` differs from the matching
translation, re-fetch that exact reference's text via `getVersesForReference` — skipped entirely when they
already match, the common case. This is the same one-line-different pattern used everywhere a reference
needs to change translation, including the Control console's live switcher (below) and Previous/Next verse
navigation (already translation-aware from Phase 6.5, unchanged).

**The Control console's translation switcher** — a dropdown in the header, next to Auto/Manual, but
*not* subject to Auto/Manual's idle-only lock: switchable any time, mid-session, mid-verse, per the
feature spec. Session-level React state (`displayTranslation`), starting from the church's default
(`churches.defaultTranslation` — its DB default was quietly wrong, `'ESV'`, a translation never ingested;
fixed to `'WEB'`, always available). Switching does three things, all client-driven:
1. Every future detection/search/cue-push call passes the new translation from then on.
2. If a verse is currently live, `changeDisplayTranslation` re-fetches that exact reference in the new
   translation (`getVerseInTranslationAction`, a thin wrapper over `getVersesForReference` — no detection,
   no search, just the lookup) and re-pushes it. **This is the core acceptance test**: push a verse live,
   flip the dropdown, watch the Stage output update to the same verse in the new translation. Live-verified
   end to end — pushed John 3:16 (WEB), then switched to KJV, then YLT, screenshotting the audience Stage
   output after each. The only client-side log lines during either switch: `[translation] re-fetched JHN
   3:16 in KJV — 684ms, no detection involved` and the matching `stage-sync` confirmation — grepping the
   full server log across the whole test window for `[detection]`/`[timing]`/`match-start` (the tags every
   real detection call always logs) returns **zero matches**, direct proof the switch never touches
   detection.
3. If Clear/Black/Logo is currently engaged, switching translation updates the underlying verse for
   whenever the operator resumes content, but does *not* silently un-black the stage as a side effect —
   `pushLive` gained a `preserveMode` flag specifically for this call site, since every other call to it
   (a cue, a search result, a confirm) is a deliberate return to real content and should keep resetting
   panic mode as before.

A verse **cue** clicked after a translation switch also honors the session's current translation (a
Prep-built cue's cached text is otherwise fixed at whatever translation was active when it was added,
same content-caching philosophy as every other cue type) — `pushCueLive` does the same decoupled
re-lookup `changeDisplayTranslation` does when a cue's cached translation doesn't match the session's
current one, so "future pushes for the rest of the session" (per the feature spec) genuinely covers every
push path, not just AI matches and manual search.

**Church settings gained an edit form** for the default translation (previously write-once at onboarding,
display-only afterward) — admin-only, same pattern as the logo upload form. Changes only what *new*
sessions start on; a session already running keeps whatever the operator has it set to.

`packages/bible-data`: 100 tests passing (up from 97) — new coverage resolves the same reference across
all four translations and asserts genuinely distinct wording (not the same text relabeled), the Strong's-
number regression check above, and `resolveScripture`'s `opts.translation` threading through to exact-
match text.

### Three more translations added (still Phase 9, additive)

**BSB (Berean Standard Bible), GNV (Geneva Bible, 1599), and DRB (Douay-Rheims Bible, 1899 Challoner
revision)** — same public-domain bar as WEB/KJV/ASV/YLT, ingested the same way via `pnpm ingest <CODE>`.
No code changes beyond `BIBLE_TRANSLATIONS` in `packages/shared-types`: the translation-switcher work
above already made every translation-aware code path generic over the code string, so adding one is purely
a data-ingestion + allow-list change. All 7 translations verified post-ingest with
`select translation, count(*), count(embedding) from verses group by translation` — ~31k verses each
(DRB: 31,263; BSB: 31,086; GNV: 31,090), `count(embedding)` zero for all but WEB, confirming matching still
runs on exactly one translation. John 3:16 spot-checked across all three to confirm genuinely distinct
wording, not placeholder or duplicated text (Geneva's 16th-century spelling — "loued", "worlde", "onely
begotten Sonne" — is an especially clear tell that the real text ingested, not a WEB copy relabeled).

**DRB's ingestion needed a slower path.** bolls.life rate-limited (`HTTP 429`) repeated ingestion attempts
at the library's default concurrency (8), and again at a reduced concurrency of 2 — it behaves like a
cumulative quota rather than a simple per-minute burst window, since lower concurrency delayed the 429 but
didn't prevent it. Succeeded on a fully sequential (concurrency 1) run. If a future re-ingest of DRB (or a
similarly-sized translation) hits the same wall, `pnpm ingest DRB` is idempotent and safe to retry — bolls.life's
rate limit resets over time, and `fetchTranslation()`'s `onConflictDoUpdate` means a partial prior attempt
never leaves bad data, just incomplete data, so retrying (or waiting and retrying) is always safe.

**LSV (Literal Standard Version)** is also served by bolls.life and is freely redistributable, but under
CC BY-SA rather than public domain — it requires visible attribution wherever displayed, which none of the
other translations here need. Deliberately not ingested: adding it is a product decision (where/how to show
that attribution in the Control console and Stage output), not just an ingestion question.

## Prerequisites

- Node.js 20.9+, pnpm
- A [Supabase](https://supabase.com) project (same one from Phase 0 is fine)
- A Google Cloud OAuth client, if you want Google sign-in (optional — email/password works without it)
- An [AssemblyAI](https://www.assemblyai.com/app/account) account — `ASSEMBLYAI_API_KEY` in
  `apps/web/.env.local` (Phase 7+; the Control console's live session shows a clear "not
  configured" error and falls back to the mock demo without it, so it's optional until you want
  real transcription)

## One-time Supabase dashboard setup

Beyond `apps/web/.env.local` (see `.env.example`), three things need setting up in the Supabase
dashboard before auth works end to end — none of this is something the app can do for you:

1. **API keys** — Project Settings → API → copy the Project URL and `anon` `public` key into
   `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
2. **Redirect URLs** — Authentication → URL Configuration: set Site URL to
   `http://localhost:3000`, and add `http://localhost:3000/**` to Redirect URLs. Without this,
   Supabase silently refuses the OAuth/email-confirmation redirect targets this app uses.
3. **Confirmation email template** — Authentication → Email Templates → "Confirm signup": replace
   the link with:
   ```
   <a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email&next=/dashboard">Confirm your email</a>
   ```
   This app verifies email confirmation server-side via `/auth/confirm` (`token_hash` +
   `verifyOtp`), not Supabase's default hosted verify link — without this template change,
   confirmation links won't route back into the app correctly.
4. **Google sign-in (optional)** — Authentication → Providers → Google: enable it and paste a
   Client ID/Secret from a Google Cloud OAuth consent screen + credentials
   (console.cloud.google.com). Add `https://<your-project-ref>.supabase.co/auth/v1/callback` as
   the authorized redirect URI on the Google Cloud side. Skip this entirely if you only want to
   test email/password — the "Continue with Google" button will just fail gracefully.

## Running it locally

```bash
pnpm install
cp apps/web/.env.example apps/web/.env.local   # fill in as described above
pnpm db:generate && pnpm db:migrate            # if you haven't already run Phase 1's migrations
pnpm dev
```

Open the URL printed in the terminal (usually `http://localhost:3000`).

## Other commands

```bash
pnpm build          # production build of apps/web
pnpm start          # run the production build
pnpm lint           # eslint across packages/* and apps/web
pnpm typecheck      # tsc --noEmit across every workspace package
pnpm test           # vitest across every package (role-hierarchy logic, reference parser, live bible-data + detection-engine fixtures)
pnpm format         # prettier --write .
pnpm db:studio      # Drizzle Studio — browse the DB in a local UI
```

## What's not built yet

The Electron NDI bridge. See the overview doc's "Suggested build order" for what's next. Live
speech-to-text (Phase 7) is built and has been verified against real AssemblyAI traffic with
synthesized real speech (see "Real-world bug found while piloting, and the fix" in the Phase 7
section above) — still worth a real human-voice pilot in an actual service before fully trusting
it, since synthesized speech doesn't fully stand in for a live room's audio quality, accents, or
background noise.
