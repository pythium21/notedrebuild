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

-- ---------------------------------------------------------------------------
-- actions + projects/tasks alterations (DECISIONS.md D-011)
--
-- Applied live 2026-08-05 (confirmed by user). Ran directly in the Supabase
-- SQL editor per CLAUDE.md's no-migrations-via-Claude-Code rule — this block
-- documents what was applied, it wasn't executed by Claude Code.
-- ---------------------------------------------------------------------------

-- Resolve projects.status collision: migrate legacy 3-value status (not null,
-- defaulted) to the new 4-value lifecycle status (nullable, no default) in
-- place, rather than adding a second same-named column.
alter table public.projects alter column status drop not null;
alter table public.projects alter column status drop default;
update public.projects set status = 'active' where status in ('Planning', 'In progress');
update public.projects set status = 'done' where status = 'Done';
-- status now holds only active/done/null going forward (on_hold and archived
-- are new states with no legacy equivalent — nothing to migrate into them)

-- Legacy steps column superseded by the actions table — dropped.
alter table public.projects drop column if exists steps;

create table if not exists public.actions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  project_id uuid not null references public.projects(id) on delete cascade,
  title text not null,
  completed boolean not null default false,
  flagged_today boolean not null default false,
  linked_task_id uuid references public.tasks(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.actions enable row level security;

create policy "actions_select_own" on public.actions
  for select using (user_id = auth.uid());

create policy "actions_insert_own" on public.actions
  for insert with check (user_id = auth.uid());

create policy "actions_update_own" on public.actions
  for update using (user_id = auth.uid());

create policy "actions_delete_own" on public.actions
  for delete using (user_id = auth.uid());

alter table public.projects add column if not exists parent_id uuid references public.projects(id) on delete restrict;
alter table public.projects add column if not exists priority text; -- nullable: high/medium/low
alter table public.projects add column if not exists description text;
alter table public.projects add column if not exists due_date date;
alter table public.projects add column if not exists tags text[];

alter table public.tasks add column if not exists flagged_today boolean not null default false;

-- ---------------------------------------------------------------------------
-- pages, project_saves, projects.outcome/page_id (DECISIONS.md D-012)
--
-- Applied live 2026-08-05 (confirmed by user). Ran directly in the Supabase
-- SQL editor per CLAUDE.md's no-migrations-via-Claude-Code rule — this block
-- documents what was applied, it wasn't executed by Claude Code.
-- ---------------------------------------------------------------------------

create table if not exists public.pages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null default 'Untitled',
  emoji text,
  parent_id uuid references public.pages(id) on delete restrict,
  content jsonb not null default '[]',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.pages enable row level security;

create policy "pages_select_own" on public.pages
  for select using (user_id = auth.uid());

create policy "pages_insert_own" on public.pages
  for insert with check (user_id = auth.uid());

create policy "pages_update_own" on public.pages
  for update using (user_id = auth.uid());

create policy "pages_delete_own" on public.pages
  for delete using (user_id = auth.uid());

alter table public.projects add column if not exists outcome text;
alter table public.projects add column if not exists page_id uuid references public.pages(id) on delete set null;

create table if not exists public.project_saves (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  save_id uuid not null references public.saves(id) on delete cascade,
  action_id uuid references public.actions(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.project_saves enable row level security;

-- No user_id column on this table — ownership is enforced transitively
-- through project_id's FK to projects, whose RLS already scopes by user_id.
create policy "project_saves_select_own" on public.project_saves
  for select using (
    exists (select 1 from public.projects where projects.id = project_saves.project_id and projects.user_id = auth.uid())
  );

create policy "project_saves_insert_own" on public.project_saves
  for insert with check (
    exists (select 1 from public.projects where projects.id = project_saves.project_id and projects.user_id = auth.uid())
  );

create policy "project_saves_update_own" on public.project_saves
  for update using (
    exists (select 1 from public.projects where projects.id = project_saves.project_id and projects.user_id = auth.uid())
  );

create policy "project_saves_delete_own" on public.project_saves
  for delete using (
    exists (select 1 from public.projects where projects.id = project_saves.project_id and projects.user_id = auth.uid())
  );
