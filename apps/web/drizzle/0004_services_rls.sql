-- Custom SQL migration file, put your code below! --

-- Same posture as 0002_profiles_trigger_and_rls.sql: the app's own reads/
-- writes go through Drizzle on a connection that owns these tables (RLS
-- doesn't apply to owners), so this is defense-in-depth for future direct
-- client-side Supabase queries (e.g. Realtime, once the Stage output route
-- needs it), not today's actual authorization boundary — that's
-- requireActiveMembership() in src/lib/auth/membership.ts.
alter table public.services enable row level security;
alter table public.cue_items enable row level security;

create policy "members can view their church's services"
  on public.services for select
  to authenticated
  using (church_id in (select public.church_ids_for_current_user()));

create policy "members can view cue items of their church's services"
  on public.cue_items for select
  to authenticated
  using (
    service_id in (
      select id from public.services
      where church_id in (select public.church_ids_for_current_user())
    )
  );