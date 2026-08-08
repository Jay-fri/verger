-- Custom SQL migration file, put your code below! --

-- live_state is deliberately readable by anyone who knows the service ID —
-- the Stage output route (src/app/stage/[serviceId]) is a public, chrome-free
-- page meant to be pointed at by vMix's Browser Source, which can't carry an
-- authenticated session. The content itself (a verse, a song lyric line, an
-- announcement) isn't sensitive, and the service ID (a UUID embedded in the
-- URL) is the practical access boundary, the same trust model as a shared
-- calendar/meeting link. This is a deliberate exception to every other
-- table's "authenticated church members only" RLS posture in this app.
--
-- Unlike those other tables, RLS here is NOT just defense-in-depth: the
-- browser-side Realtime subscription on the Stage output page connects as
-- `anon` directly (no Next.js server in the loop for that leg), so this
-- policy is the actual, real-time-enforced authorization boundary for who
-- receives live_state change events.
grant select on public.live_state to anon;

alter table public.live_state enable row level security;

create policy "anyone can read live state"
  on public.live_state for select
  to anon, authenticated
  using (true);

-- Required for Postgres Changes: a table only fires realtime change events
-- if it's part of the supabase_realtime publication.
alter publication supabase_realtime add table public.live_state;
