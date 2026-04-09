-- ─────────────────────────────────────────────────────────────
--  Nerdlandia — Schema Update: Achievements & Events
--  sql/05_achievements_events.sql
--
--  Run this in Supabase SQL Editor AFTER 01_schema.sql
--  Safe to re-run — uses IF NOT EXISTS throughout
-- ─────────────────────────────────────────────────────────────

-- ── EVENT TYPES ───────────────────────────────────────────────
-- Stores the dropdown options for event type
create table if not exists public.event_types (
  id         uuid primary key default uuid_generate_v4(),
  name       text not null unique,
  is_default boolean default false,
  created_at timestamptz default now()
);

-- Seed default event types
insert into public.event_types (name, is_default) values
  ('Online', true),
  ('In-person', true),
  ('Hybrid', true)
on conflict (name) do nothing;

-- ── EVENTS ───────────────────────────────────────────────────
create table if not exists public.events (
  id            uuid primary key default uuid_generate_v4(),
  title         text not null,
  description   text,
  event_type_id uuid references public.event_types(id) on delete set null,
  location      text,                    -- relevant for in-person/hybrid
  start_date    date not null,
  start_time    time,
  end_date      date not null,
  end_time      time,
  max_teams     int,                     -- null = unlimited
  -- status is derived from dates, not stored:
  -- upcoming  = today < start_date
  -- active    = start_date <= today <= end_date
  -- completed = today > end_date
  created_by    uuid references public.profiles(id) on delete set null,
  created_at    timestamptz default now()
);

-- ── EVENT REGISTRATIONS ───────────────────────────────────────
create table if not exists public.event_registrations (
  id            uuid primary key default uuid_generate_v4(),
  event_id      uuid not null references public.events(id) on delete cascade,
  team_id       uuid not null references public.teams(id) on delete cascade,
  points        int not null default 0,
  placement     int,
  registered_by uuid references public.profiles(id) on delete set null,
  registered_at timestamptz default now(),
  unique(event_id, team_id)
);

-- ── ACHIEVEMENTS ─────────────────────────────────────────────
-- Each achievement is a badge assignable to teams, individuals,
-- events, or event items (scavenger hunt items).
-- For now only team assignments are built out.
create table if not exists public.achievements (
  id           uuid primary key default uuid_generate_v4(),
  name         text not null,
  description  text,
  image_url    text,
  levels       jsonb not null default '[]'::jsonb,
  -- levels structure:
  -- [{ "level": 1, "label": "Bronze", "threshold": 100, "color": "#CD7F32" }, ...]
  created_by   uuid references public.profiles(id) on delete set null,
  created_at   timestamptz default now()
);

-- ── TEAM ACHIEVEMENTS ─────────────────────────────────────────
create table if not exists public.team_achievements (
  id             uuid primary key default uuid_generate_v4(),
  team_id        uuid not null references public.teams(id) on delete cascade,
  achievement_id uuid not null references public.achievements(id) on delete cascade,
  current_level  int not null default 0,
  progress       int not null default 0,
  assigned_by    uuid references public.profiles(id) on delete set null,
  assigned_at    timestamptz default now(),
  updated_at     timestamptz default now(),
  unique(team_id, achievement_id)
);

-- ── STORAGE BUCKETS ──────────────────────────────────────────
insert into storage.buckets (id, name, public)
values ('achievements', 'achievements', true)
on conflict (id) do nothing;

create policy "Achievement images are publicly readable"
  on storage.objects for select
  using (bucket_id = 'achievements');

create policy "Admins can upload achievement images"
  on storage.objects for insert
  with check (bucket_id = 'achievements' and public.is_admin());

create policy "Admins can update achievement images"
  on storage.objects for update
  using (bucket_id = 'achievements' and public.is_admin());

-- ── RLS ──────────────────────────────────────────────────────
alter table public.event_types         enable row level security;
alter table public.achievements        enable row level security;
alter table public.team_achievements   enable row level security;
alter table public.events              enable row level security;
alter table public.event_registrations enable row level security;

-- Event types: public read, admin write
create policy "Event types are publicly readable"
  on public.event_types for select using (true);
create policy "Only admin can manage event types"
  on public.event_types for all using (public.is_admin());

-- Achievements: public read, admin write
create policy "Achievements are publicly readable"
  on public.achievements for select using (true);
create policy "Only admin can create achievements"
  on public.achievements for insert with check (public.is_admin());
create policy "Only admin can update achievements"
  on public.achievements for update using (public.is_admin());
create policy "Only admin can delete achievements"
  on public.achievements for delete using (public.is_admin());

-- Team achievements: public read, admin write
create policy "Team achievements are publicly readable"
  on public.team_achievements for select using (true);
create policy "Only admin can assign achievements"
  on public.team_achievements for insert with check (public.is_admin());
create policy "Only admin can update achievement progress"
  on public.team_achievements for update using (public.is_admin());
create policy "Only admin can remove team achievements"
  on public.team_achievements for delete using (public.is_admin());

-- Events: public read, admin write
create policy "Events are publicly readable"
  on public.events for select using (true);
create policy "Only admin can create events"
  on public.events for insert with check (public.is_admin());
create policy "Only admin can update events"
  on public.events for update using (public.is_admin());
create policy "Only admin can delete events"
  on public.events for delete using (public.is_admin());

-- Event registrations: public read, admin write (self-registration added later)
create policy "Event registrations are publicly readable"
  on public.event_registrations for select using (true);
create policy "Only admin can manage event registrations"
  on public.event_registrations for all using (public.is_admin());

-- ── HELPERS ──────────────────────────────────────────────────
create or replace function public.team_total_points(p_team_id uuid)
returns int language sql stable as $$
  select coalesce(sum(points), 0)::int
  from public.event_registrations
  where team_id = p_team_id;
$$;

-- Derive event status from dates
create or replace function public.event_status(p_start date, p_end date)
returns text language sql stable as $$
  select case
    when current_date < p_start then 'upcoming'
    when current_date between p_start and p_end then 'active'
    else 'completed'
  end;
$$;
