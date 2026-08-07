# Verger

A live scripture-detection tool for church media teams. See
[verger-project-overview.md](./verger-project-overview.md) for the full product spec.

This repo is at **Phase 3: the detection engine (mocked transcript)**. Phase 0 (scaffolding),
Phase 1 (auth, church accounts, roles, onboarding), and Phase 2 (the Bible data layer) are done.
This phase adds the piece that turns a stream of transcript text into scored, routed scripture
matches — fed a mock transcript for now, no live audio yet, no UI. Prep, the Control console, and
live speech-to-text are still not built.

## Folder structure

```
verger/
├── apps/
│   └── web/                      # Next.js app (App Router, TypeScript) — the actual product
│       ├── src/app/              # Routes: sign-up/sign-in, onboarding, invite, dashboard, ...
│       ├── src/lib/db/           # Drizzle client + schema (churches, church_members, invites, profiles)
│       ├── src/lib/supabase/     # Supabase clients: browser, server (cookie-bound), proxy session refresh
│       ├── src/lib/auth/         # Session + church-membership + role-check helpers, auth Server Actions
│       ├── src/lib/invites/      # Invite generate/accept Server Actions
│       ├── src/lib/onboarding/   # Create-church Server Action
│       ├── src/components/ui.tsx # Shared themed form/card primitives
│       ├── src/proxy.ts          # Next.js 16 "proxy" (formerly middleware) — session refresh + auth gate
│       └── drizzle/              # Generated + custom SQL migrations (drizzle-kit)
├── packages/
│   ├── bible-data/                 # Indexed WEB translation (~31k verses), exact-ref parser, pgvector semantic search
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

- Translation: **World English Bible (WEB)**, public domain, sourced from
  [bolls.life](https://bolls.life)'s API — chosen specifically to avoid licensing questions during
  development. A licensed modern translation (NIV, ESV, etc.) needs its own rights check with the
  publisher before production use.
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

## Prerequisites

- Node.js 20.9+, pnpm
- A [Supabase](https://supabase.com) project (same one from Phase 0 is fine)
- A Google Cloud OAuth client, if you want Google sign-in (optional — email/password works without it)

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

Live speech-to-text (the detection engine is still fed a mock transcript array), Prep, the Control
console, the Stage output route, and the Electron NDI bridge. See the overview doc's "Suggested
build order" for what's next.
