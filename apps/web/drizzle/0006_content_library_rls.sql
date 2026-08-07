-- Custom SQL migration file, put your code below! --

-- Same posture as 0002/0004: defense-in-depth for future direct client-side
-- Supabase queries, not today's actual authorization boundary (Drizzle
-- writes go through a connection that owns these tables, exempt from RLS).
alter table public.songs enable row level security;
alter table public.song_sections enable row level security;
alter table public.announcements enable row level security;
alter table public.announcement_slides enable row level security;
alter table public.custom_texts enable row level security;

create policy "members can view their church's songs"
  on public.songs for select
  to authenticated
  using (church_id in (select public.church_ids_for_current_user()));

create policy "members can view sections of their church's songs"
  on public.song_sections for select
  to authenticated
  using (
    song_id in (
      select id from public.songs
      where church_id in (select public.church_ids_for_current_user())
    )
  );

create policy "members can view their church's announcements"
  on public.announcements for select
  to authenticated
  using (church_id in (select public.church_ids_for_current_user()));

create policy "members can view slides of their church's announcements"
  on public.announcement_slides for select
  to authenticated
  using (
    announcement_id in (
      select id from public.announcements
      where church_id in (select public.church_ids_for_current_user())
    )
  );

create policy "members can view their church's custom text"
  on public.custom_texts for select
  to authenticated
  using (church_id in (select public.church_ids_for_current_user()));
