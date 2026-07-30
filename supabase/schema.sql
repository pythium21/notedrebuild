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
