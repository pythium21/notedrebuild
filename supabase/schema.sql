-- My OS — initial schema (Projects + Tasks scaffold)
-- Run this once in the Supabase SQL editor on a fresh project.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- projects
-- ---------------------------------------------------------------------------

create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  name text not null,
  steps text,
  status text not null default 'Planning'
);

alter table public.projects enable row level security;

create policy "projects_select_own" on public.projects
  for select using (user_id = auth.uid());

create policy "projects_insert_own" on public.projects
  for insert with check (user_id = auth.uid());

create policy "projects_update_own" on public.projects
  for update using (user_id = auth.uid());

create policy "projects_delete_own" on public.projects
  for delete using (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- tasks
-- ---------------------------------------------------------------------------

create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  name text not null,
  tag text,
  done boolean not null default false,
  date date
);

alter table public.tasks enable row level security;

create policy "tasks_select_own" on public.tasks
  for select using (user_id = auth.uid());

create policy "tasks_insert_own" on public.tasks
  for insert with check (user_id = auth.uid());

create policy "tasks_update_own" on public.tasks
  for update using (user_id = auth.uid());

create policy "tasks_delete_own" on public.tasks
  for delete using (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- saves
--
-- Pre-existing table, carried over from the old NOTED Supabase project
-- (DECISIONS.md D-003). `if not exists` here is a no-op against the live
-- project — this statement documents the live shape for anyone standing the
-- schema up fresh, it doesn't create anything new against production.
-- Columns confirmed live via PostgREST probing; see SCHEMA.md's saves section
-- for what was actually verified vs. assumed.
-- ---------------------------------------------------------------------------

create table if not exists public.saves (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  url text not null,
  title text not null,
  platform text not null default 'Websites',
  date date
);

alter table public.saves enable row level security;

create policy "saves_select_own" on public.saves
  for select using (user_id = auth.uid());

create policy "saves_insert_own" on public.saves
  for insert with check (user_id = auth.uid());

create policy "saves_update_own" on public.saves
  for update using (user_id = auth.uid());

create policy "saves_delete_own" on public.saves
  for delete using (user_id = auth.uid());
