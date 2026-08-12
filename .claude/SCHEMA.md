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
name	text not null	the project's title field — always been `name`, never `title`; do not rename or introduce a `title` alias anywhere in Projects code
status	text, nullable	one of: active · on_hold · done · archived. Migrated in place from the legacy `Planning`/`In progress`/`Done` 3-value status (confirmed live 2026-08-05) — `not null default 'Planning'` became nullable with no default. `on_hold` and `archived` have no legacy equivalent, so no rows land there until a user sets them explicitly. See collision note below.
parent_id	uuid, nullable	references projects(id) on delete restrict; mirrors the Pages hierarchy pattern — see DECISIONS.md D-011.
priority	text, nullable	unset until user sets it; one of: high · medium · low
description	text, nullable	
due_date	date, nullable	
tags	text[], nullable	
outcome	text, nullable	free-form 1-2 sentence description of what success looks like — additive to `description`, not a replacement. Does not feed progress % computation. See DECISIONS.md D-012.
page_id	uuid, nullable	references pages(id) on delete set null. Set when "Add notes" is used on a project — no page is auto-created at project-creation time. See DECISIONS.md D-012.

Confirmed live 2026-08-05 (DECISIONS.md D-011): `status`/`priority`/`description`/`due_date`/`tags`/`parent_id` above, plus the `actions` table below, applied to the live Supabase project — see supabase/schema.sql for the exact statements that were run. The legacy `steps` column has been dropped (superseded by `actions`) — do not reference `projects.steps` anywhere; it no longer exists.

Confirmed live 2026-08-05 (DECISIONS.md D-012): `outcome` and `page_id` above, applied manually to the live Supabase project (not via Claude Code — see CLAUDE.md's no-migrations rule). See supabase/schema.sql for the documented statements.

Collision resolved (2026-08-05): the original `projects.status` (`Planning`/`In progress`/`Done`, not null, defaulted) and D-011's new `status` (`active`/`on_hold`/`done`/`archived`) couldn't coexist as two same-named columns — resolved by migrating the existing column in place rather than adding a differently-named one. Legacy values collapsed: `Planning`→`active`, `In progress`→`active`, `Done`→`done`. Consequence: the existing Projects list UI's status `<select>` (`src/app/projects/page.tsx`, `STATUSES` array + `ProjectStatus` type in `src/lib/projects.ts`) still reads the old 3-value enum as of this doc update and needs updating to the new 4-value one — tracked in BACKLOG.md.

tasks
Column	Type	Notes
name	text not null	
tag	text	free-text label; commonly a project name, deliberately no FK
done	boolean not null default false	
date	date	due/created date shown in UI
flagged_today	boolean not null default false	drives the Today view alongside actions.flagged_today; confirmed live 2026-08-05
actions
New child entity of projects (DECISIONS.md D-011) — deliberately simpler than tasks (no priority). Confirmed live 2026-08-05 with RLS policies in place.
Column	Type	Notes
project_id	uuid not null	references projects(id) on delete cascade
title	text not null	the action's title field — new table, no collision with projects.name, `title` is correct here
completed	boolean not null default false	
flagged_today	boolean not null default false	drives the Today view alongside tasks.flagged_today
linked_task_id	uuid, nullable	references tasks(id) on delete set null; set when an action is promoted to a standalone task (soft link, not copy-and-delete — see DECISIONS.md D-011)
due_date	date, nullable	added 2026-08-08 (DECISIONS.md D-013) to feed the Today page's Upcoming section; applied manually via the Supabase SQL editor per CLAUDE.md's no-migrations-via-Claude-Code convention
pages
New table (DECISIONS.md D-012), built from scratch this round — the Pages/Notes feature was designed prior to the Next.js rebuild but never carried over into this repo until now. Confirmed live 2026-08-05 with RLS policies in place (4 policies scoped by `user_id`, standard convention).
Column	Type	Notes
title	text not null default 'Untitled'	the page's title field
emoji	text, nullable	optional single emoji/short glyph shown next to the title
parent_id	uuid, nullable	references pages(id) on delete restrict — self-referencing, mirrors the same hierarchy pattern as projects.parent_id (DECISIONS.md D-011). A page with children cannot be deleted until children are re-parented or removed first; the UI surfaces this rather than letting delete silently fail (src/lib/pages.ts checks child count before attempting delete).
content	jsonb not null default '[]'	array of Block objects (`{ id, type, text?, checked?, pageId? }`); block types: `text`, `heading`, `checklist`, `bullet`, `page_link`. `page_link` blocks are inserted into a parent page's `content` when a sub-page is created from the slash-command menu — they store the child page's `id` and render its title live (looked up from the `pages` row), never a duplicated copy of it. Blocks never store `pageId` for the page they themselves belong to — the page row is already that context.
updated_at	timestamptz not null default now()	stamped explicitly by the app (`src/lib/pages.ts`'s `updatePage()`) on every write — no DB trigger exists for this. This is the one table in this schema with both `created_at` and `updated_at`; every other table only has `created_at`.
project_saves
New join table (DECISIONS.md D-012). Links a `saves` row to a `projects` row, optionally scoped to one `actions` row within that project. No `user_id` column — ownership is enforced transitively through `project_id`'s FK to `projects`, whose own RLS already scopes by `user_id`. Confirmed live 2026-08-05 with RLS policies in place (4 policies, scoped via `exists (select 1 from projects where projects.id = project_saves.project_id and projects.user_id = auth.uid())` rather than a direct `user_id = auth.uid()` check — the one table in this schema without a direct `user_id` column).
Column	Type	Notes
project_id	uuid not null	references projects(id) on delete cascade
save_id	uuid not null	references saves(id) on delete cascade
action_id	uuid, nullable	references actions(id) on delete set null. Null = save is linked at the project level. Set = save is scoped to that specific action (action-level link implies project membership too — no separate project-level row needed for the same save).
saves
This table pre-existed in the live Supabase project (repurposed from the old NOTED app, see DECISIONS.md D-003) — it was NOT created fresh, so its columns were confirmed by querying the live project directly rather than assumed. Confirmed via PostgREST column-existence probing (`select=<col>&limit=0` against `/rest/v1/saves`; the table has RLS and no accessible rows under the anon key, so a live row read wasn't possible — each candidate column name either 200s (exists) or 42703s (doesn't)).
Column	Type	Notes
url	text not null	cleaned client-side before insert (utm_* and rcm query params stripped) — see cleanUrl() in src/lib/saves.ts
title	text not null	if left blank (manual add form, or an Android share payload without one), backfilled via a server-side `og:title`/`<title>` fetch before falling back to the cleaned URL as a last resort (DECISIONS.md D-015, 2026-08-08, `src/lib/linkPreview.ts`) — best-effort, not guaranteed
platform	text not null default 'Websites'	one of: YouTube · Articles · LinkedIn · Facebook · Reddit · Websites — auto-detected from the URL host (detectPlatform()), overridable via the form's select
date	date, nullable	confirmed present live; not part of the original ask (which expected a `notes` column instead — see below) and not currently surfaced in the UI; left null on insert
read	boolean not null default false	binary unread/read toggle shown as a checkbox per row on `/saves` (DECISIONS.md D-017). Not present in the original ask — added 2026-08-09 alongside per-row delete. Confirmed live 2026-08-09.
Reconciliation note: the original assumption going into this table was `notes` (text, nullable) instead of `date`. Live probing confirmed `notes` does NOT exist on the table and `date` does — `src/lib/saves.ts` was written to match the live table, not the assumption. NOT NULL / CHECK constraint details beyond the standard convention (e.g. whether `platform` has a DB-level CHECK restricting it to the six values, whether `title` truly rejects null) could not be verified via the anon key — every insert attempt during probing was rejected by the RLS policy before any constraint violation could surface, regardless of which columns were populated. Treated as matching the tasks/projects convention (four owner-scoped RLS policies) until proven otherwise from the dashboard.
checklist_items
Recurring Items habit list (DECISIONS.md D-018, supersedes D-016's placement/scope — schema extended, not replaced) — a fully separate system from `tasks`. Confirmed live 2026-08-09 (applied manually via the Supabase SQL editor, both checklist tables and their RLS policies); D-018's frequency/days_of_week/day_of_month columns confirmed live 2026-08-12. Standard convention columns (`id`, `user_id`, `created_at`) plus:
Column	Type	Notes
title	text not null	
sort_order	int not null default 0	drives list order; the UI renumbers rows 0..n-1 on reorder, self-healing duplicates
archived	boolean not null default false	soft delete only — archiving preserves the row and its completion history for future progress/streak views; the UI never hard-deletes
frequency	text not null default 'daily'	`daily` \| `weekly` \| `monthly` (DECISIONS.md D-018). Existing pre-D-018 rows default to `daily`, preserving prior behavior with no backfill.
days_of_week	int[], nullable	ISO weekday ints, 1=Monday..7=Sunday. Only meaningful when `frequency = 'weekly'`; null/empty otherwise.
day_of_month	int, nullable, 1-31	Only meaningful when `frequency = 'monthly'`; null otherwise. `isDueOn()` (src/lib/checklist.ts) clamps to the last day of short months rather than skipping the month.
RLS: one `owner_access` policy `for all using/with check (user_id = auth.uid())` — a deliberate compact variant of the usual four-policy convention.
checklist_completions
Per-day completion log for checklist items (DECISIONS.md D-016). One row per item per local calendar day; checking inserts, unchecking deletes — history accumulates. No `user_id` column — ownership is transitive through `item_id` → `checklist_items` (same pattern as `project_saves`). The second table (after `pages`) with a timestamp column beyond `created_at` — it has `completed_at` and no `created_at`.
Column	Type	Notes
item_id	uuid not null	references checklist_items(id) on delete cascade
date	date not null	the user's LOCAL calendar date, computed client-side (`localToday()` in src/lib/checklist.ts) — not UTC. `unique (item_id, date)` — one completion per item per day; the client upserts with ignoreDuplicates
completed_at	timestamptz not null default now()	
RLS: one `owner_access` policy `for all`, scoped via `item_id in (select id from checklist_items where user_id = auth.uid())`.
events
Calendar Phase 1 (DECISIONS.md D-019) — real appointments/events, fully separate from `tasks` (which keeps its single nullable `date`). Confirmed live 2026-08-12 (applied manually via the Supabase SQL editor). Standard convention columns (`id`, `user_id`, `created_at`) plus:
Column	Type	Notes
title	text not null	
start_time	timestamptz not null	
end_time	timestamptz, nullable	null for open-ended/all-day events
all_day	boolean not null default false	when true, the UI treats `start_time` as a bare date (local midnight) rather than a specific time
location	text, nullable	
description	text, nullable	
source	text not null default 'manual'	forward-looking for later import paths (`.ics`, Google Calendar, share-target) — no reader other than `'manual'` exists yet; see BACKLOG.md Horizon
RLS: standard four-policy convention (`events_select_own`/`_insert_own`/`_update_own`/`_delete_own`), not the `checklist_items` single-policy shortcut — see DECISIONS.md D-019.
Planned tables (not yet created)

The retired vanilla repo's SCHEMA.md documents the full 13-route schema (goals, habits, expenses, workouts, journal, contacts, content, resources, vault). `pages` was the last one parked there and has now been built (DECISIONS.md D-012, see above) — remaining tables are added here one at a time, when their route is actually built — copy the section from the retired repo's SCHEMA.md at that point, don't pre-create tables.

Offline / localStorage

None. This app is Supabase-only. An offline write queue is a Horizon item pending its own decision entry — until then, no client-side persistence beyond the service worker's shell cache.