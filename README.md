# Verger

A live scripture-detection tool for church media teams. See
[verger-project-overview.md](./verger-project-overview.md) for the full product spec.

This repo is at **Phase 0: project scaffolding**. No product features are built yet — just the
monorepo, the Next.js app shell, Supabase/Drizzle wiring, and a health check.

## Folder structure

```
verger/
├── apps/
│   └── web/                # Next.js app (App Router, TypeScript) — the actual product
│       ├── src/app/        # Prep, Control console, Stage output, detection engine live here
│       ├── src/lib/db/     # Drizzle client + schema
│       ├── src/lib/supabase/ # Supabase JS client (browser + server)
│       └── drizzle/        # Generated SQL migrations (drizzle-kit)
├── packages/
│   ├── bible-data/         # Indexed translation text, exact-ref parser, semantic search (empty — Phase 1)
│   ├── detection-engine/   # STT client, matching logic, confidence scoring (empty — Phase 2)
│   └── shared-types/       # Types shared across web app and packages (empty — filled in as needed)
└── infra/                  # Deploy/environment notes
```

`apps/web` is the only runnable app right now. The three `packages/*` are empty placeholders
wired into the pnpm workspace so later phases have somewhere to land without restructuring.

## Tech stack (Phase 0 slice)

- **Next.js 16** (App Router, TypeScript, Turbopack) — hosted on Vercel eventually, run locally for now
- **Tailwind CSS v4** — custom theme tokens (not default component styling), see
  [apps/web/src/app/globals.css](./apps/web/src/app/globals.css) for the dark/light palette from
  the overview doc's "Design direction" section
- **Supabase** — Postgres, Auth, Realtime (only Postgres is wired up so far, via Drizzle)
- **Drizzle ORM** — schema + migrations against Supabase Postgres, using the `postgres` driver
- **pnpm workspaces** — no Turborepo; plain `pnpm -r` / `--filter` covers this repo's size for now

### Why Drizzle over the alternatives

Prisma was the other obvious choice. Went with Drizzle because it's SQL-first (matters once
pgvector and embedding queries show up in the Bible data layer — Prisma's query builder fights
raw vector operators), has a lighter runtime footprint for a Vercel serverless deployment, and its
migration files are plain `.sql` you can read and hand-edit if a Supabase-specific extension
(pgvector, RLS policies) needs manual tweaking.

## Prerequisites

- Node.js 20.9+ (Next.js 16 requirement)
- pnpm (`corepack enable` or `npm i -g pnpm`)
- A [Supabase](https://supabase.com) project (free tier is fine for local dev)

## Running it locally

```bash
# 1. Install dependencies for the whole workspace
pnpm install

# 2. Set up environment variables
cp apps/web/.env.example apps/web/.env.local
# then fill in apps/web/.env.local with your Supabase project's values:
#   NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY
#   (Supabase dashboard -> Project Settings -> API)
#   DATABASE_URL
#   (Supabase dashboard -> Project Settings -> Database -> Connection string -> URI;
#   use the direct/session connection for local migrations)

# 3. Run the health-check migration so the DB status shows "connected"
pnpm db:generate   # generates SQL migration files from apps/web/src/lib/db/schema.ts
pnpm db:migrate    # applies them to your Supabase Postgres database

# 4. Start the dev server
pnpm dev
```

Then open **http://localhost:3000** (Next.js will pick the next free port if 3000 is taken —
check the terminal output) to see the health-check page. It reports:

- App running status
- Database connectivity (Supabase Postgres, via Drizzle) — shows "Not configured" until step 2–3
  above are done
- A timestamp, confirming the page is server-rendered live, not cached

The same data is available as JSON at `/api/health`.

## Other commands

```bash
pnpm build          # production build of apps/web
pnpm start           # run the production build
pnpm lint            # eslint across packages/* and apps/web
pnpm typecheck        # tsc --noEmit across every workspace package
pnpm format           # prettier --write .
pnpm db:studio        # Drizzle Studio — browse the DB in a local UI
```

## What's not built yet

Everything past the health check: auth, Prep, the detection engine, the Control console, the
Stage output route, and the Electron NDI bridge. See the overview doc's "Suggested build order"
for what's next.
