SCHEMA.md

Single source of truth for all table and column facts. If code disagrees with this file, this file wins (see CLAUDE.md conflict rules). The SQL to create everything below lives in supabase/schema.sql.

Conventions
All tables live in the public schema.
Every table: id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id), created_at timestamptz not null default now().
Row Level Security is enabled on every table with the same four policies: users can select/insert/update/delete only rows where user_id = auth.uid().
Client writes set user_id from the authenticated session; it is never user-supplied input. Exception: saves rows written by the /api/share-target route handler are stamped with user_id from the NOTED_USER_ID env var via a service_role client, not a session — see DECISIONS.md D-009.
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
saves
This table pre-existed in the live Supabase project (repurposed from the old NOTED app, see DECISIONS.md D-003) — it was NOT created fresh, so its columns were confirmed by querying the live project directly rather than assumed. Confirmed via PostgREST column-existence probing (`select=<col>&limit=0` against `/rest/v1/saves`; the table has RLS and no accessible rows under the anon key, so a live row read wasn't possible — each candidate column name either 200s (exists) or 42703s (doesn't)).
Column	Type	Notes
url	text not null	cleaned client-side before insert (utm_* and rcm query params stripped) — see cleanUrl() in src/lib/saves.ts
title	text not null	if left blank in the add form, defaults to the cleaned URL
platform	text not null default 'Websites'	one of: YouTube · Articles · LinkedIn · Facebook · Reddit · Websites — auto-detected from the URL host (detectPlatform()), overridable via the form's select
date	date, nullable	confirmed present live; not part of the original ask (which expected a `notes` column instead — see below) and not currently surfaced in the UI; left null on insert
Reconciliation note: the original assumption going into this table was `notes` (text, nullable) instead of `date`. Live probing confirmed `notes` does NOT exist on the table and `date` does — `src/lib/saves.ts` was written to match the live table, not the assumption. NOT NULL / CHECK constraint details beyond the standard convention (e.g. whether `platform` has a DB-level CHECK restricting it to the six values, whether `title` truly rejects null) could not be verified via the anon key — every insert attempt during probing was rejected by the RLS policy before any constraint violation could surface, regardless of which columns were populated. Treated as matching the tasks/projects convention (four owner-scoped RLS policies) until proven otherwise from the dashboard.
Planned tables (not yet created)

The retired vanilla repo's SCHEMA.md documents the full 13-route schema (goals, habits, expenses, workouts, journal, contacts, content, resources, vault, pages). Tables are added here one at a time, when their route is actually built — copy the section from the retired repo's SCHEMA.md at that point, don't pre-create tables. The pages table spec (with parent_id nesting and the updated_at convention exception) lives there ready for when the Notes/Pages feature lands.

Offline / localStorage

None. This app is Supabase-only. An offline write queue is a Horizon item pending its own decision entry — until then, no client-side persistence beyond the service worker's shell cache.