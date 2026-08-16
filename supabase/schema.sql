-- My OS — full schema, accumulated section by section as features shipped.
-- Every statement in this file is idempotent (create table/policy guarded
-- with if not exists, alter table with add column if not exists) — the
-- whole file can be re-run safely against a project that already has some
-- or all of it applied. Run in the Supabase SQL editor; nothing here is
-- executed automatically by Claude Code (CLAUDE.md's no-migrations rule).

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

do $$ begin
  if not exists (select from pg_policies where tablename = 'projects' and policyname = 'projects_select_own') then
    create policy "projects_select_own" on public.projects for select using (user_id = auth.uid());
  end if;
  if not exists (select from pg_policies where tablename = 'projects' and policyname = 'projects_insert_own') then
    create policy "projects_insert_own" on public.projects for insert with check (user_id = auth.uid());
  end if;
  if not exists (select from pg_policies where tablename = 'projects' and policyname = 'projects_update_own') then
    create policy "projects_update_own" on public.projects for update using (user_id = auth.uid());
  end if;
  if not exists (select from pg_policies where tablename = 'projects' and policyname = 'projects_delete_own') then
    create policy "projects_delete_own" on public.projects for delete using (user_id = auth.uid());
  end if;
end $$;

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

do $$ begin
  if not exists (select from pg_policies where tablename = 'tasks' and policyname = 'tasks_select_own') then
    create policy "tasks_select_own" on public.tasks for select using (user_id = auth.uid());
  end if;
  if not exists (select from pg_policies where tablename = 'tasks' and policyname = 'tasks_insert_own') then
    create policy "tasks_insert_own" on public.tasks for insert with check (user_id = auth.uid());
  end if;
  if not exists (select from pg_policies where tablename = 'tasks' and policyname = 'tasks_update_own') then
    create policy "tasks_update_own" on public.tasks for update using (user_id = auth.uid());
  end if;
  if not exists (select from pg_policies where tablename = 'tasks' and policyname = 'tasks_delete_own') then
    create policy "tasks_delete_own" on public.tasks for delete using (user_id = auth.uid());
  end if;
end $$;

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

do $$ begin
  if not exists (select from pg_policies where tablename = 'saves' and policyname = 'saves_select_own') then
    create policy "saves_select_own" on public.saves for select using (user_id = auth.uid());
  end if;
  if not exists (select from pg_policies where tablename = 'saves' and policyname = 'saves_insert_own') then
    create policy "saves_insert_own" on public.saves for insert with check (user_id = auth.uid());
  end if;
  if not exists (select from pg_policies where tablename = 'saves' and policyname = 'saves_update_own') then
    create policy "saves_update_own" on public.saves for update using (user_id = auth.uid());
  end if;
  if not exists (select from pg_policies where tablename = 'saves' and policyname = 'saves_delete_own') then
    create policy "saves_delete_own" on public.saves for delete using (user_id = auth.uid());
  end if;
end $$;

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

do $$ begin
  if not exists (select from pg_policies where tablename = 'actions' and policyname = 'actions_select_own') then
    create policy "actions_select_own" on public.actions for select using (user_id = auth.uid());
  end if;
  if not exists (select from pg_policies where tablename = 'actions' and policyname = 'actions_insert_own') then
    create policy "actions_insert_own" on public.actions for insert with check (user_id = auth.uid());
  end if;
  if not exists (select from pg_policies where tablename = 'actions' and policyname = 'actions_update_own') then
    create policy "actions_update_own" on public.actions for update using (user_id = auth.uid());
  end if;
  if not exists (select from pg_policies where tablename = 'actions' and policyname = 'actions_delete_own') then
    create policy "actions_delete_own" on public.actions for delete using (user_id = auth.uid());
  end if;
end $$;

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

do $$ begin
  if not exists (select from pg_policies where tablename = 'pages' and policyname = 'pages_select_own') then
    create policy "pages_select_own" on public.pages for select using (user_id = auth.uid());
  end if;
  if not exists (select from pg_policies where tablename = 'pages' and policyname = 'pages_insert_own') then
    create policy "pages_insert_own" on public.pages for insert with check (user_id = auth.uid());
  end if;
  if not exists (select from pg_policies where tablename = 'pages' and policyname = 'pages_update_own') then
    create policy "pages_update_own" on public.pages for update using (user_id = auth.uid());
  end if;
  if not exists (select from pg_policies where tablename = 'pages' and policyname = 'pages_delete_own') then
    create policy "pages_delete_own" on public.pages for delete using (user_id = auth.uid());
  end if;
end $$;

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
do $$ begin
  if not exists (select from pg_policies where tablename = 'project_saves' and policyname = 'project_saves_select_own') then
    create policy "project_saves_select_own" on public.project_saves
      for select using (
        exists (select 1 from public.projects where projects.id = project_saves.project_id and projects.user_id = auth.uid())
      );
  end if;
  if not exists (select from pg_policies where tablename = 'project_saves' and policyname = 'project_saves_insert_own') then
    create policy "project_saves_insert_own" on public.project_saves
      for insert with check (
        exists (select 1 from public.projects where projects.id = project_saves.project_id and projects.user_id = auth.uid())
      );
  end if;
  if not exists (select from pg_policies where tablename = 'project_saves' and policyname = 'project_saves_update_own') then
    create policy "project_saves_update_own" on public.project_saves
      for update using (
        exists (select 1 from public.projects where projects.id = project_saves.project_id and projects.user_id = auth.uid())
      );
  end if;
  if not exists (select from pg_policies where tablename = 'project_saves' and policyname = 'project_saves_delete_own') then
    create policy "project_saves_delete_own" on public.project_saves
      for delete using (
        exists (select 1 from public.projects where projects.id = project_saves.project_id and projects.user_id = auth.uid())
      );
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- actions.due_date (DECISIONS.md D-013)
--
-- Applied live 2026-08-08 (confirmed by user). Ran directly in the Supabase
-- SQL editor per CLAUDE.md's no-migrations-via-Claude-Code rule — this
-- documents what was applied, it wasn't executed by Claude Code.
-- ---------------------------------------------------------------------------

alter table public.actions add column if not exists due_date date;

-- ---------------------------------------------------------------------------
-- Daily Checklist (DECISIONS.md D-016)
--
-- To be applied manually in the Supabase SQL editor per CLAUDE.md's
-- no-migrations-via-Claude-Code rule — this documents the statements, it
-- wasn't executed by Claude Code. checklist_completions has no user_id;
-- ownership is transitive through item_id -> checklist_items (same pattern
-- as project_saves). Single for-all owner_access policy per table (a
-- deliberate, more compact variant of the usual four-policy convention).
-- ---------------------------------------------------------------------------

create table if not exists checklist_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  title text not null,
  sort_order int not null default 0,
  archived boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists checklist_completions (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references checklist_items(id) on delete cascade,
  date date not null,
  completed_at timestamptz not null default now(),
  unique (item_id, date)
);

alter table checklist_items enable row level security;
alter table checklist_completions enable row level security;

do $$ begin
  if not exists (select from pg_policies where tablename = 'checklist_items' and policyname = 'owner_access') then
    create policy owner_access on checklist_items
      for all using (user_id = auth.uid()) with check (user_id = auth.uid());
  end if;
end $$;

do $$ begin
  if not exists (select from pg_policies where tablename = 'checklist_completions' and policyname = 'owner_access') then
    create policy owner_access on checklist_completions
      for all using (
        item_id in (select id from checklist_items where user_id = auth.uid())
      ) with check (
        item_id in (select id from checklist_items where user_id = auth.uid())
      );
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- saves.read (DECISIONS.md D-017)
--
-- To be applied manually in the Supabase SQL editor per CLAUDE.md's
-- no-migrations-via-Claude-Code rule — this documents the statement, it
-- wasn't executed by Claude Code.
-- ---------------------------------------------------------------------------

alter table public.saves add column if not exists read boolean not null default false;

-- ---------------------------------------------------------------------------
-- Recurring Items: fixed schedule + own route (DECISIONS.md D-018)
--
-- Extends D-016's checklist_items/checklist_completions rather than replacing.
-- To be applied manually in the Supabase SQL editor per CLAUDE.md's
-- no-migrations-via-Claude-Code rule.
-- ---------------------------------------------------------------------------

alter table checklist_items add column if not exists frequency text not null default 'daily'
  check (frequency in ('daily', 'weekly', 'monthly'));

-- Weekly: array of ISO weekday ints, 1=Monday..7=Sunday. Null/empty for daily & monthly.
alter table checklist_items add column if not exists days_of_week int[];

-- Monthly: day-of-month 1-31. Null for daily & weekly.
alter table checklist_items add column if not exists day_of_month int
  check (day_of_month is null or (day_of_month between 1 and 31));

-- Existing rows are all daily-cadence today; default 'daily' above preserves
-- their current behavior with no backfill needed.

-- ---------------------------------------------------------------------------
-- Calendar Phase 1: events table (DECISIONS.md D-019)
--
-- To be applied manually in the Supabase SQL editor per CLAUDE.md's
-- no-migrations-via-Claude-Code rule. Fully separate from tasks — tasks keep
-- their single nullable `date`; events get real start/end timestamps.
-- ---------------------------------------------------------------------------

create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  title text not null,
  start_time timestamptz not null,
  end_time timestamptz,
  all_day boolean not null default false,
  location text,
  description text,
  source text not null default 'manual',
  created_at timestamptz not null default now()
);

alter table public.events enable row level security;

do $$ begin
  if not exists (select from pg_policies where tablename = 'events' and policyname = 'events_select_own') then
    create policy events_select_own on public.events for select using (user_id = auth.uid());
  end if;
  if not exists (select from pg_policies where tablename = 'events' and policyname = 'events_insert_own') then
    create policy events_insert_own on public.events for insert with check (user_id = auth.uid());
  end if;
  if not exists (select from pg_policies where tablename = 'events' and policyname = 'events_update_own') then
    create policy events_update_own on public.events for update using (user_id = auth.uid());
  end if;
  if not exists (select from pg_policies where tablename = 'events' and policyname = 'events_delete_own') then
    create policy events_delete_own on public.events for delete using (user_id = auth.uid());
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Tasks: archive alongside delete (DECISIONS.md D-021)
--
-- To be applied manually in the Supabase SQL editor per CLAUDE.md's
-- no-migrations-via-Claude-Code rule. Archiving a completed task hides it
-- from the active list without losing the row — unlike Recurring Items,
-- tasks have no child completion-history table; the row itself IS the
-- history, so archived_at is what lets the Archived tab show "completed on".
-- ---------------------------------------------------------------------------

alter table tasks add column if not exists archived boolean not null default false;
alter table tasks add column if not exists archived_at timestamptz;

-- ---------------------------------------------------------------------------
-- Recurring Item Entry Tracking (DECISIONS.md D-022)
--
-- Applied live 2026-08-16 (confirmed by user). Ran directly in the Supabase
-- SQL editor per CLAUDE.md's no-migrations-via-Claude-Code rule — this block
-- documents what was applied, it wasn't executed by Claude Code.
-- General-purpose sub-tracking for checklist_items: entry_configs holds the mandatory target + type,
-- entry_labels holds the loggable things (chips/checkboxes/unit), and
-- recurring_entries is the append-only log. Auto-completion is computed in
-- application code (src/lib/recurringEntries.ts) and mirrored into the
-- existing checklist_completions table — no schema coupling between them.
-- ---------------------------------------------------------------------------

create table if not exists public.entry_configs (
  id uuid primary key default gen_random_uuid(),
  checklist_item_id uuid not null references checklist_items(id) on delete cascade,
  user_id uuid not null references auth.users(id),
  type text not null check (type in ('counter', 'checklist', 'numeric')),
  target integer not null,
  created_at timestamptz default now(),
  unique(checklist_item_id)
);

create table if not exists public.entry_labels (
  id uuid primary key default gen_random_uuid(),
  entry_config_id uuid not null references entry_configs(id) on delete cascade,
  name text not null,
  default_value numeric,
  unit text,
  sort_order integer not null default 0,
  created_at timestamptz default now()
);

create table if not exists public.recurring_entries (
  id uuid primary key default gen_random_uuid(),
  checklist_item_id uuid not null references checklist_items(id) on delete cascade,
  entry_label_id uuid references entry_labels(id) on delete set null,
  user_id uuid not null references auth.users(id),
  value numeric,
  note text,
  logged_at timestamptz not null default now(),
  created_at timestamptz default now()
);

alter table public.entry_configs enable row level security;
alter table public.entry_labels enable row level security;
alter table public.recurring_entries enable row level security;

do $$ begin
  if not exists (select from pg_policies where tablename = 'entry_configs' and policyname = 'owner_access') then
    create policy owner_access on entry_configs
      for all using (user_id = auth.uid()) with check (user_id = auth.uid());
  end if;
end $$;

do $$ begin
  if not exists (select from pg_policies where tablename = 'entry_labels' and policyname = 'owner_access') then
    create policy owner_access on entry_labels
      for all using (
        entry_config_id in (select id from entry_configs where user_id = auth.uid())
      ) with check (
        entry_config_id in (select id from entry_configs where user_id = auth.uid())
      );
  end if;
end $$;

do $$ begin
  if not exists (select from pg_policies where tablename = 'recurring_entries' and policyname = 'owner_access') then
    create policy owner_access on recurring_entries
      for all using (user_id = auth.uid()) with check (user_id = auth.uid());
  end if;
end $$;
