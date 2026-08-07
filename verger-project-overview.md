# Verger

**A live scripture-detection tool for church media teams.**

---

## Part 1 — What this is (for the media director)

### The one-line version

Verger listens to the pastor as he preaches, automatically recognizes the Bible verse being quoted or referenced — even when paraphrased — and puts it on screen, feeding straight into vMix like a live camera source. No one has to manually search for or type out verses mid-sermon anymore.

### The problem it solves

Right now, getting a scripture verse on screen during a live sermon means someone on the media team is listening closely, searching for the reference, and switching a slide — all while trying not to fall behind the pastor. If the pastor paraphrases instead of quoting exactly, or jumps between verses quickly, it's easy to lag or miss one.

Verger removes that manual step. It listens continuously, matches what's being said — including paraphrases, not just exact quotes — and gets the verse ready to go on screen, fast.

### How the media team would actually use it

1. **Before the service (Prep):** Load the week's outline — the key verses and songs planned for the sermon. This isn't required, but it makes the live detection sharper because Verger checks the planned verses first before searching the whole Bible.
2. **During the service (Live):** Verger listens through the service audio. When it's confident about a match, it can display it automatically. When it's less sure, it puts the suggestion in a queue for the operator to confirm with one tap — never guessing wrong on screen.
3. **In vMix:** Verger's display output shows up as an NDI source, exactly like any camera or graphics input. The media team adds it in vMix once, and from then on it behaves like any other input they already know how to work with. vMix still handles the camera mix, recording, and pushing the service live to YouTube/Facebook/wherever — Verger does not touch that part at all.
4. **Slides, lyrics, announcements, and custom text:** beyond automatic scripture detection, the media team can build a library of song lyrics, announcement slides, and one-off custom text — and run them from the same operator screen as a simple cue list, in whatever order the service needs. This runs through the same Stage output and NDI feed as the verse display, so there's one output the media team manages, not several separate tools.
5. **After the service:** Verger can put together a simple recap — the verses used and when — for reference or reuse later.

### What Verger is *not*

- It does not replace vMix, and it does not stream to social media itself. vMix keeps doing exactly what it already does — Verger only feeds it one more input.
- It does not require the media team to touch a browser, a terminal, or any developer tool. They install one app (like installing any other program on their computer) and it shows up as a named source inside vMix.
- It is not trying to be a full slide/lyrics/announcements replacement on day one — the first version is focused specifically on getting scripture detection right.

### A future addition, not part of this version

Down the line, this same detection engine could power a "solo" mode for a pastor preaching without a media team — controlled from his own phone or tablet, casting straight to a TV. That's intentionally not part of this build; it's designed so it can be added later without reworking what's built now.

---

## Part 2 — What this is (for development / Claude Code)

### Product name
**Verger** — chosen deliberately: a verger is historically the person who manages the practical, technical side of a church service so the clergy can focus on the message. Checked for naming conflicts against existing church-presentation software (PewBeam, WayPresenter, QWorship, EasyWorship, ProPresenter, Proclaim, Loghema, WorshipTools, OpenLP, Praisenter, and others) — no collision. Domain and trademark search turned up no conflicting software product using this name.

### Core scope of this build

Verger is a **web application** used by a church media team, paired with a **desktop companion app** that exists solely to expose the app's live output as an NDI source for vMix. There is no solo/pastor-facing mode in this build — the architecture should not preclude adding one later (see "Future extensibility" below), but no UI or workflow for it should be built now.

### System components

**1. Web app** (the actual product — Next.js)
- **Prep module**: build/load a service outline ahead of time — key verses, songs, order of service. This narrows the search space for live detection.
- **Detection engine**: consumes a live transcript stream and returns scored verse matches.
  - *Exact-reference path*: literal citations ("John 3:16") resolve via direct lookup — no AI/semantic matching needed, near-instant.
  - *Semantic path*: paraphrased or indirect references go through embedding-based similarity search against indexed Bible text, checked against the Prep outline first, then the full Bible if no outline match.
  - Every match returns a confidence score.
- **Confidence router**: high-confidence matches can auto-display; lower-confidence matches go to an operator queue for manual confirmation. This threshold is a config value per session — not hardcoded — because it's also the single lever that will let a future "solo" mode reuse this exact engine (see below).
- **Control console**: the operator-facing UI — live suggestion queue, one-tap confirm/override, manual search fallback, current outline view.
- **Stage output route**: a bare, chrome-free web page that renders only the current verse/lyric, styled for full-screen display. This is the page the NDI bridge captures.
- **Content module**: a library and cue system for song lyrics, announcement slides, and custom text — separate content types, one shared runner. Each item (song, announcement, custom text) is a slide or set of slides; the operator builds an ordered cue list (in Prep, before the service, same place the verse outline is built) and can jump between cues live from the Control console. This shares the Stage output route and the NDI feed with verse detection — there is one live output, not several competing systems. Live scripture detection can interleave with the manual cue list (e.g. operator running lyrics, then AI-detected verse appears and can be pushed to the same output) rather than the two being mutually exclusive modes.
- **Realtime sync**: Control console and Stage output route are different windows/processes and must stay in sync over the network (not assumed to be on the same LAN) — via a managed realtime channel (Supabase Realtime, Ably, or PartyKit).

**2. Desktop NDI bridge** (Electron — a separate, thin wrapper app)
- Purpose: NDI is a native network protocol implemented via a native SDK; a browser tab cannot emit NDI directly. This app exists solely to bridge that gap.
- Structure: one Electron app, two windows —
  - A **visible window** loading the Control console (so the media team never needs to open an actual browser — this window *is* the app's UI for them).
  - A **hidden/offscreen window** loading the Stage output route, whose rendered frames are captured and republished as an NDI source (via a binding to the NDI SDK — e.g. the `grandiose` Node package) so it appears as a named input inside vMix.
- This wrapper contains almost no independent logic — it consumes the same web app codebase, it does not duplicate it.
- Packaged as a standard installer (`.exe` for Windows, matching what the media team already uses for vMix) via `electron-builder`.
- Note: transparent/alpha-channel output (for overlay-only compositing over a live camera feed in vMix, rather than a full-screen graphic) should be tested early — NDI alpha support varies by tooling version and is a risk to validate before relying on it.

**3. What is explicitly out of scope for this build**
- No RTMP relay, no multistream fan-out, no direct integration with YouTube/Facebook/Instagram. vMix owns all of that downstream of the NDI input.
- No solo/mobile pastor-facing mode or UI.

### Suggested repo structure

```
verger/
├── apps/
│   ├── web/              # Next.js — Prep, Control console, Stage output route, detection engine
│   └── desktop/           # Electron wrapper — visible Control window + hidden NDI-publishing window
├── packages/
│   ├── bible-data/        # indexed translation(s), embeddings for semantic search, exact-reference parser
│   ├── detection-engine/  # STT client, matching logic, confidence scoring — shared by web app
│   └── shared-types/
└── infra/                  # deploy config, environment setup
```

### Suggested build order

1. **Bible data layer** — ingest a translation, build exact-reference parsing + embedding-based semantic search. Testable in isolation against transcript fixtures, no UI or audio needed yet.
2. **Detection engine** — feed it mock transcript text, verify scored matches, before touching live audio.
3. **Control console UI** — Prep builder + live operator queue, against mocked detection output.
4. **Content module** — song/lyrics/announcement/custom-text library, cue list builder in Prep, and cue-running UI in the Control console, sharing the same Stage output route as verse display.
5. **Realtime sync** — wire Control console ↔ Stage output route over a realtime channel.
6. **Live speech-to-text integration** — replace mocked transcript with a real streaming STT provider (AssemblyAI).
7. **Stage output route polish** — this is a legitimate, useful checkpoint: at this point the app can be piloted via vMix's built-in Browser Source input, with no NDI bridge yet.
8. **Electron NDI bridge** — scaffold Electron app → capture frames from the offscreen window → publish via NDI SDK binding → verify in NDI's Studio Monitor tool → verify inside vMix specifically → package as an installer.

### Tech stack

| Layer | Choice | Notes |
|---|---|---|
| Frontend | Next.js + Tailwind (custom theme, not default component styling) | Prep, Control console, Stage output route. Hosted on **Vercel**. |
| Hosting & repo | **Vercel** (web app) + **GitHub** (source repo) | Standard, confirmed |
| Database, auth, realtime sync | **Supabase** (confirmed — Postgres + Auth + Realtime, consolidated into one service) | Control console ↔ Stage output sync runs over Supabase Realtime, cross-network, not LAN-dependent. Consolidating here avoids juggling separate free tiers for DB/auth/realtime. |
| Streaming speech-to-text | AssemblyAI (streaming API, confirmed) | Purpose-built for continuous streaming transcription — word-level timestamps and confidence scores as first-class output, which the confidence router depends on. ~$0.01/minute; a 90-minute service costs well under $1 |
| Verse matching | Exact-match lookup (literal references) + embedding/vector search via pgvector (Supabase Postgres) over indexed Bible text; an LLM (Claude or Gemini) may assist in *reasoning* about which verse a paraphrase points to | Prep outline checked first, then full Bible. **Hard rule: the LLM may only select/rank candidate matches — it must never generate the scripture text itself.** Displayed text is always retrieved from the verified indexed database, never model-generated. This is non-negotiable given the credibility/accuracy stakes of live scripture display. |
| Backend | Node/Fastify or Python (FastAPI) | Orchestrates STT → matching → push to Control/Stage |
| Auth | Supabase Auth — org/church-based accounts, pastor/operator roles | |
| Desktop bridge | Electron + `grandiose` (NDI SDK binding) + `electron-builder` | Not hosted on Vercel — Electron's windows load the Vercel-hosted web app URL directly (same pattern as Slack/Discord desktop apps). The installer itself is distributed via GitHub Releases, a separate step from web hosting. Requires accepting NDI SDK's redistribution license before shipping the installer |

### Auxiliary AI assistant features (separate from the detection engine)

These are a different risk category from live scripture display and should be architected as a **separate module**, not folded into the detection engine's logic:

- **In-app help/FAQ assistant**: answers "how does this feature work" style questions. Low stakes — nothing it says is shown to the congregation. **Confirmed: Gemini 3.5 Flash-Lite** — cheap ($0.30/$2.50 per 1M tokens on paid tier) with a free tier (~5–15 requests/minute, ~1,000/day) that comfortably covers this app's expected volume. Feeding it this document as context is a reasonable way to ground its answers in what the app actually does.
- **Ad-hoc lookup tool** ("search for X and put it on screen"): **Confirmed: Gemini 3.5 Flash-Lite**, using its native Google Search grounding (~5,000 free grounded prompts/month across the Gemini 3.x family) — well suited to "look this up and cite a source" tasks at this app's scale.
- **Note on the free tier**: Google may use free-tier content to improve its products. Not a concern for a help bot describing the app itself; worth revisiting (enable billing to opt out) only if the lookup tool ever handles anything sensitive — unlikely given its scope, but worth knowing.
- **Hard rule for this module**: anything this assistant produces must go through the same operator-confirm step as the verse queue before it's displayed live — never auto-pushed straight to the screen. A wrong or hallucinated fact in front of a congregation is a real credibility risk, same principle as the scripture retrieval-only rule above, just for a different reason (general factual accuracy rather than doctrinal accuracy).

### Design direction (visual identity)

*This section is for development/Claude Code — not part of what the media director needs to review.*

**Reference pattern studied**: EasyWorship's interface is a proven, fast-to-learn loop — a schedule pane (order of service) on one side, click an item to see its slides, click a slide to send it live. A volunteer learns this in about 20 minutes. ProPresenter is more powerful but has a steeper multi-panel learning curve. Verger's Control console should follow EasyWorship's shallow, three-step logic for anything that overlaps with familiar territory (the cue list, the live/next preview) — and reserve visual distinctiveness for the one genuinely new concept: the AI detection queue.

**Control console layout** — three panes:
1. **Order of service** (left) — the full cue list (verses, songs, announcements, custom text), same logic as any competitor's schedule pane. Active item highlighted.
2. **Live output** (center) — current slide large and unambiguous, next slide below it. Mirrors the Stage output route exactly.
3. **AI detected** (right) — kept visually separate from the cue list rather than blended in, since this is the new capability nobody else has. Each detected match shows a confidence state, not a raw percentage:
   - High confidence → sage/green treatment, safe to trust
   - Needs review → terracotta/orange treatment, operator should confirm before it goes live
   - Color alone communicates the required action — no numeric confidence score should be surfaced in the UI.

**Color palette** — warm ink/parchment identity, deliberately not the cold blue-gradient look common across AI products and most competitors in this category:

*Dark mode (primary — the Control console runs in a dim booth environment):*
| Role | Hex |
|---|---|
| Base background | `#17140F` |
| Surface / card | `#221D17` |
| Border | `#3A322A` |
| Text primary | `#F3ECDD` |
| Text secondary | `#A89B87` |
| Accent gold (brand, active/live item) | `#D6A34C` |
| Confident match | `#7C9257` |
| Needs review | `#C97A3D` |
| Live / on-air indicator | `#B5473A` |

*Light mode (Prep/admin screens, daytime use):*
| Role | Hex |
|---|---|
| Base background | `#F7F1E6` |
| Surface / card | `#FFFCF5` |
| Border | `#DED2B9` |
| Text primary | `#241F19` |
| Text secondary | `#6E6455` |
| Accent gold | `#A9782A` |
| Confident match | `#5F7A3D` |
| Needs review | `#A85F27` |
| Live / on-air indicator | `#96392D` |

**Iconography**: avoid default outline icon packs (Feather, Lucide, etc.) — every competitor in this category uses one of these, and it's the fastest way to look generic. Prefer a small custom icon set built around manuscript/typographic motifs (a quill-nib cursor, a marginalia mark, an open-fold shape) rather than stock outline icons, especially for the handful of icons that appear constantly (live indicator, confirm/override, cue list item types).


### Future extensibility (not built now, but designed for)

- **Solo mode**: the confidence router's auto-display threshold is the only thing that would differ — a lower threshold and a simplified UI, consuming the same detection engine and the same underlying "current suggestion" state as the operator queue. No fork of the engine, no duplicate logic — just a different config and a different view.
- **Multistream to social platforms**: intentionally not built, since vMix already owns this. If ever needed independent of vMix, the pattern (browser capture → WHIP ingest → relay → RTMP fan-out) is proven elsewhere (this is how StreamYard's architecture works) and could be added as a separate service without touching the core app.

---

*Document prepared as project context for development. Please review Part 1 and confirm the workflow matches how your team actually operates day-to-day — especially the Prep step and how the operator queue should behave when Verger is unsure of a match.*
