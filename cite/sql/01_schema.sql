-- ─────────────────────────────────────────────────────────────
--  Nerdlandia — Supabase Schema
--  Paste this entire file into: Supabase Dashboard → SQL Editor → New Query → Run
-- ─────────────────────────────────────────────────────────────

-- ── EXTENSIONS ──────────────────────────────────────────────
create extension if not exists "uuid-ossp";

-- ── TEAMS (create before profiles so we can FK to it) ────────
create table public.teams (
  id           uuid primary key default uuid_generate_v4(),
  name         text not null unique,
  description  text,
  photo_url    text,
  lead_id      uuid,                      -- filled in after first profile is created
  created_at   timestamptz default now()
);

-- ── PROFILES ────────────────────────────────────────────────
-- One row per auth user. Created automatically via trigger on signup.
create table public.profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  email        text not null,
  username     text unique,
  full_name    text,
  bio          text,
  photo_url    text,
  team_id      uuid references public.teams(id) on delete set null,
  role         text not null default 'individual'
                 check (role in ('individual', 'team_lead', 'admin')),
  created_at   timestamptz default now()
);

-- Now we can add the FK from teams.lead_id → profiles.id
alter table public.teams
  add constraint fk_team_lead
  foreign key (lead_id) references public.profiles(id) on delete set null;

-- ── TEAM INVITES ─────────────────────────────────────────────
create table public.team_invites (
  id         uuid primary key default uuid_generate_v4(),
  team_id    uuid not null references public.teams(id) on delete cascade,
  email      text not null,
  token      text not null unique default encode(gen_random_bytes(24), 'hex'),
  status     text not null default 'pending'
               check (status in ('pending', 'accepted', 'declined')),
  invited_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz default now(),
  unique(team_id, email)
);

-- ── NOUN LIST ────────────────────────────────────────────────
create table public.noun_list (
  word text primary key
);

-- ─────────────────────────────────────────────────────────────
--  AUTO-CREATE PROFILE ON SIGNUP
-- ─────────────────────────────────────────────────────────────
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer as $$
declare
  v_role text := 'individual';
begin
  -- First ever user becomes admin (account #1 rule)
  if (select count(*) from public.profiles) = 0 then
    v_role := 'admin';
  end if;

  insert into public.profiles (id, email, role)
  values (new.id, new.email, v_role);

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ─────────────────────────────────────────────────────────────
--  TEAM MEMBER COUNT HELPER
-- ─────────────────────────────────────────────────────────────
create or replace function public.team_member_count(p_team_id uuid)
returns int language sql stable as $$
  select count(*)::int from public.profiles where team_id = p_team_id;
$$;

-- ─────────────────────────────────────────────────────────────
--  PROMOTE OLDEST MEMBER WHEN LEAD LEAVES
-- ─────────────────────────────────────────────────────────────
create or replace function public.handle_lead_departure()
returns trigger language plpgsql security definer as $$
declare
  v_new_lead_id uuid;
  v_team_id     uuid;
begin
  -- Only act when a team_lead's team_id is set to null or role changes away from team_lead
  if old.role = 'team_lead' and old.team_id is not null then
    v_team_id := old.team_id;

    -- Find oldest remaining member (excluding the departing lead)
    select id into v_new_lead_id
    from public.profiles
    where team_id = v_team_id
      and id <> old.id
    order by created_at asc
    limit 1;

    if v_new_lead_id is not null then
      -- Promote them
      update public.profiles set role = 'team_lead' where id = v_new_lead_id;
      update public.teams set lead_id = v_new_lead_id where id = v_team_id;
    else
      -- No members left — clear the lead from the team row
      update public.teams set lead_id = null where id = v_team_id;
    end if;
  end if;
  return new;
end;
$$;

create trigger on_lead_departure
  after update on public.profiles
  for each row
  when (old.role = 'team_lead' and (new.role <> 'team_lead' or new.team_id is null))
  execute procedure public.handle_lead_departure();

-- ─────────────────────────────────────────────────────────────
--  ROW LEVEL SECURITY
-- ─────────────────────────────────────────────────────────────
alter table public.profiles     enable row level security;
alter table public.teams        enable row level security;
alter table public.team_invites enable row level security;
alter table public.noun_list    enable row level security;

-- Helper: is the current user an admin?
create or replace function public.is_admin()
returns boolean language sql stable security definer as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

-- Helper: is current user the lead of a given team?
create or replace function public.is_team_lead(p_team_id uuid)
returns boolean language sql stable security definer as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and team_id = p_team_id and role = 'team_lead'
  );
$$;

-- ── PROFILES POLICIES ────────────────────────────────────────
-- Anyone (even logged out) can read profiles — needed for public team pages
create policy "Profiles are publicly readable"
  on public.profiles for select using (true);

-- Users can update their own profile; admins can update any profile
create policy "Users update own profile"
  on public.profiles for update
  using (auth.uid() = id or public.is_admin());

-- ── TEAMS POLICIES ───────────────────────────────────────────
create policy "Teams are publicly readable"
  on public.teams for select using (true);

-- Logged-in users can create a team
create policy "Authenticated users can create teams"
  on public.teams for insert
  with check (auth.uid() is not null);

-- Team lead or admin can update team (name changes admin-only enforced in app logic + below)
create policy "Team lead or admin can update team"
  on public.teams for update
  using (public.is_team_lead(id) or public.is_admin());

-- Only admin can delete a team
create policy "Only admin can delete team"
  on public.teams for delete
  using (public.is_admin());

-- ── TEAM INVITES POLICIES ────────────────────────────────────
create policy "Team members can read their team invites"
  on public.team_invites for select
  using (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and team_id = team_invites.team_id
    )
    or public.is_admin()
  );

create policy "Team lead or admin can create invites"
  on public.team_invites for insert
  with check (public.is_team_lead(team_id) or public.is_admin());

create policy "Team lead or admin can update invites"
  on public.team_invites for update
  using (public.is_team_lead(team_id) or public.is_admin());

create policy "Team lead or admin can delete invites"
  on public.team_invites for delete
  using (public.is_team_lead(team_id) or public.is_admin());

-- ── NOUN LIST POLICIES ───────────────────────────────────────
-- Anyone can read (needed for client-side name validation)
create policy "Noun list is publicly readable"
  on public.noun_list for select using (true);

-- Only admin can modify the noun list
create policy "Only admin can modify noun list"
  on public.noun_list for all
  using (public.is_admin());
