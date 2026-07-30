SCHEMA.md

Single source of truth for all table and column facts. If code disagrees with this file, this file wins (see CLAUDE.md conflict rules). The SQL to create everything below lives in supabase/schema.sql.

Conventions
All tables live in the public schema.
Every table: id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id), created_at timestamptz not null default now().
Row Level Security is enabled on every table with the same four policies: users can select/insert/update/delete only rows where user_id = auth.uid().
Client writes set user_id from the authenticated session; it is never user-supplied input.
Tables
projects
Column	Type	Notes
name	text not null	
steps	text	actionable steps summary
status	text not null default 'Planning'	one of: Planning · In progress · Done
tasks
Column	Type	Notes
name	text not null	
tag	text	free-text label; commonly a project name, deliberately no FK
done	boolean not null default false	
date	date	due/created date shown in UI
Planned tables (not yet created)

The retired vanilla repo's SCHEMA.md documents the full 13-route schema (goals, habits, expenses, saves, workouts, journal, contacts, content, resources, vault, pages). Tables are added here one at a time, when their route is actually built — copy the section from the retired repo's SCHEMA.md at that point, don't pre-create tables. The pages table spec (with parent_id nesting and the updated_at convention exception) lives there ready for when the Notes/Pages feature lands.

Offline / localStorage

None. This app is Supabase-only. An offline write queue is a Horizon item pending its own decision entry — until then, no client-side persistence beyond the service worker's shell cache.