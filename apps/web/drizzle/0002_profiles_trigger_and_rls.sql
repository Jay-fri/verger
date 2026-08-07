-- Custom SQL migration file, put your code below! --

-- ---------------------------------------------------------------------------
-- 1. Keep public.profiles in sync with auth.users.
--
-- Application code should never query auth.users directly (Supabase best
-- practice) — this trigger mirrors the id/email/name into our own table the
-- moment a user signs up, so church_members/church_invites can join against
-- profiles for display (name, email) without touching the auth schema.
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (
    new.id,
    new.email,
    new.raw_user_meta_data ->> 'full_name'
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- 2. Row Level Security.
--
-- Our Next.js server talks to Postgres through Drizzle using a connection
-- that owns these tables, which Postgres exempts from RLS by default — so
-- RLS here is defense-in-depth for any *future* direct client-side Supabase
-- queries (e.g. Realtime subscriptions in a later phase), not the primary
-- authorization boundary. The primary boundary is the server-side role
-- checks in apps/web/src/lib/auth — see requireChurchRole().
--
-- church_members is self-referential (a policy on it needs to query it to
-- determine "which churches is this user a member of"), which trips
-- Postgres's RLS recursion guard if done with a plain subquery. The
-- standard fix is a SECURITY DEFINER helper function: it runs as the
-- (RLS-exempt) table owner internally, so the outer policy's subquery
-- doesn't re-trigger its own policy.
-- ---------------------------------------------------------------------------
create or replace function public.church_ids_for_current_user()
returns setof uuid
language sql
security definer
set search_path = ''
stable
as $$
  select church_id from public.church_members where user_id = auth.uid()
$$;

alter table public.churches enable row level security;
alter table public.church_members enable row level security;
alter table public.church_invites enable row level security;
alter table public.profiles enable row level security;

-- churches: members can see the church(es) they belong to. Any authenticated
-- user can create one (this is the onboarding "create a church" step).
create policy "members can view their churches"
  on public.churches for select
  to authenticated
  using (id in (select public.church_ids_for_current_user()));

create policy "authenticated users can create a church"
  on public.churches for insert
  to authenticated
  with check (auth.uid() is not null);

-- church_members: members can see the full roster of churches they belong
-- to (needed for the team list). No direct-client insert/update/delete —
-- membership changes only happen server-side (create church, accept invite).
create policy "members can view fellow members of their churches"
  on public.church_members for select
  to authenticated
  using (church_id in (select public.church_ids_for_current_user()));

-- profiles: you can always see your own profile, plus the profiles of
-- anyone who shares a church with you (needed for the team list's
-- name/email display).
create policy "members can view their own and church-mates' profiles"
  on public.profiles for select
  to authenticated
  using (
    id = auth.uid()
    or id in (
      select user_id from public.church_members
      where church_id in (select public.church_ids_for_current_user())
    )
  );

-- church_invites: intentionally no policies for the authenticated/anon
-- roles. Invite tokens are bearer credentials — until there's a real need
-- for direct-client invite reads, deny-by-default (RLS enabled, zero
-- policies) is the safer posture. Server-side code reads/writes this table
-- through Drizzle, which bypasses RLS as the table owner.
