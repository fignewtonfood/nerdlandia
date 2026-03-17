-- ─────────────────────────────────────────────────────────────
--  Nerdlandia — Storage Buckets
--  Run AFTER 01_schema.sql
-- ─────────────────────────────────────────────────────────────

-- Create storage buckets
insert into storage.buckets (id, name, public)
values
  ('avatars', 'avatars', true),
  ('team-photos', 'team-photos', true)
on conflict (id) do nothing;

-- ── AVATAR STORAGE POLICIES ──────────────────────────────────
create policy "Avatar images are publicly readable"
  on storage.objects for select
  using (bucket_id = 'avatars');

create policy "Users can upload their own avatar"
  on storage.objects for insert
  with check (
    bucket_id = 'avatars'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "Users can update their own avatar"
  on storage.objects for update
  using (
    bucket_id = 'avatars'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "Users can delete their own avatar"
  on storage.objects for delete
  using (
    bucket_id = 'avatars'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

-- ── TEAM PHOTO STORAGE POLICIES ──────────────────────────────
create policy "Team photos are publicly readable"
  on storage.objects for select
  using (bucket_id = 'team-photos');

create policy "Team lead or admin can upload team photo"
  on storage.objects for insert
  with check (
    bucket_id = 'team-photos'
    and (
      public.is_admin()
      or exists (
        select 1 from public.profiles
        where id = auth.uid()
          and role = 'team_lead'
          and team_id::text = (storage.foldername(name))[1]
      )
    )
  );

create policy "Team lead or admin can update team photo"
  on storage.objects for update
  using (
    bucket_id = 'team-photos'
    and (
      public.is_admin()
      or exists (
        select 1 from public.profiles
        where id = auth.uid()
          and role = 'team_lead'
          and team_id::text = (storage.foldername(name))[1]
      )
    )
  );
