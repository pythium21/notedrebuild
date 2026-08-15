# BACKLOG.md

All open work. **Active** is flat-ranked by priority (top = next). **Horizon** is unranked — ideas parked until pulled in by actual usage, per the capture-first build order in DECISIONS.md D-008 (old repo).

## Active

1. Apply the D-021 schema change (`tasks.archived`, `tasks.archived_at` — see `supabase/schema.sql`'s D-021 block) manually in the Supabase SQL editor, then flip SCHEMA.md's "NOT YET CONFIRMED LIVE" notes on those two columns. Until this is applied, Task Archive/Unarchive and the "Archived" tab on `/tasks` will error (missing columns).
2. Once D-021's schema is live, verify on device: archiving a completed task removes it from the active Tasks list and from Calendar due-date rows, shows up on the "Archived" tab with the right "Completed <date>", Unarchive restores it to the active list, and Archive only appears in a task's expanded panel once it's marked done (not before).
3. Daily-use trial: setup is complete (Supabase live, schema applied, env vars wired, Railway deployed, PWA installed and in real daily use on a phone — see STATUS.md) — the open part is using it for a sustained week and pulling new work from that usage rather than building ahead of it (DECISIONS.md D-002).
4. Verify on a real device (2026-08-08 fixes): (a) Notes no longer freezes navigation — the DrawerContext infinite render loop is fixed (MISTAKES.md top entry, confirmed via browser harness); (b) save titles now show real page titles — URL-shaped share-sheet titles are treated as missing and the backfill auto-runs on `/saves` load (DECISIONS.md D-015 Update 2). The Saves bottom nav fix (URL-overflow, MISTAKES.md) is already user-confirmed working on device.
5. The Notes slash-menu-behind-keyboard problem (#6 in the Aug 6 batch) remains unfixed after the `interactiveWidget: 'resizes-content'` revert (see MISTAKES.md). Needs a scoped approach: a JS `visualViewport` listener that repositions just the block-menu popup above the keyboard, rather than a global viewport-level setting that affects every fixed-position element in the app.
6. Verify `saves` table constraints against the live Supabase dashboard (NOT NULL / CHECK on `platform`, `title`) — only column existence was confirmed via anon-key PostgREST probing when the `/saves` route was built (DECISIONS.md D-003); RLS blocked every insert attempt before a constraint violation could surface, so those details are currently assumed to match the tasks/projects convention rather than confirmed.
7. Fix `manifest.json`'s `share_target` enctype — browser console warns it defaults to `application/x-www-form-urlencoded`; verify the `/share-target` route's expected content type and set `enctype` explicitly, then reinstall the PWA to pick up the manifest change.
8. Saves delete + read toggle (DECISIONS.md D-017): schema applied 2026-08-09 — verify on device (delete removes a row, read checkbox persists across refresh).
9. Recurring Items (DECISIONS.md D-018, supersedes D-016; relocated by D-020): schema applied 2026-08-12 — verify on device end-to-end on the "Recurring" tab at `/tasks`: add flow requires a frequency chip before Add enables; a daily item behaves as before (shows every day, streak counts consecutive days); a weekly item only appears on its chosen weekday(s); a monthly item appears on its chosen day and clamps correctly for day_of_month=29/30/31 in short months; complete/uncomplete (via the expanded panel's button, D-020) still adds/removes the completion row; archive still preserves completion history; the Tasks/Recurring tab toggle switches views correctly and the "Recurring" nav item is gone from desktop sidebar and mobile bottom-nav/drawer (5 nav items total).
10. Calendar Phase 1 (DECISIONS.md D-019): schema applied 2026-08-12 — verify on device on the Today page's new "Calendar" tab: Month grid shows the current day highlighted, event dots and due-task counts per day; Agenda view skips days with nothing scheduled; tapping a day opens the detail panel as a dropdown on desktop and a bottom sheet on mobile; quick-add creates a timed event and an all-day event correctly (all-day event doesn't require a start time); event delete removes it from both the panel and the grid/agenda without a refresh; due tasks shown read-only and link to `/tasks`; switching months re-fetches correctly including Prev/Next/Today nav.
11. D-020 tab move, accordion + hard delete: verify on device — the Tasks/Recurring chip toggle on `/tasks`; tap-to-expand accordion on both Tasks and Recurring rows, including that Recurring rows actually expand now (2026-08-15 fix for a click-propagation bug that silently no-opped every tap); Complete/Uncomplete, Edit, and Delete reachable from Tasks' expanded panel; Complete/Uncomplete, Edit, Delete, and — only once the item is completed for today — Archive reachable from Recurring's expanded panel; the new Recurring "Delete" button (confirms, removes the row and its completion history for good — distinct from Archive).

## Tasks

P1 — capture-flow gaps found in daily use:

- [x] Edit an existing task (currently entry-only, no edit form) — done 2026-08-04
- [x] Delete a task from the UI (currently requires direct DB access) — done 2026-08-04
- [x] Display created_at on each task in the list view — done 2026-08-04

## Save Manager

P2:

- [x] Fix URL overflow in list view — done 2026-08-08, and it turned out to be far more than cosmetic: the unbreakable-URL overflow was the confirmed root cause of the "unusable Saves screen / missing bottom nav" report (see MISTAKES.md). Fixed three ways: `overflow-wrap: anywhere` on `.item__name` + `overflow-x: clip` on `.main` (the hard CSS guarantee, user-confirmed on device), `og:title` fetch at save time (DECISIONS.md D-015), and the auto-running title backfill for pre-D-015 rows (D-015 Update 2; on-device verification tracked in Active item 2).

## Projects

Architecture decided 2026-08-05 (DECISIONS.md D-011) — resolves the prior "no detail view" open question. Built 2026-08-05:

- [x] Apply the schema SQL manually in Supabase — `projects.name` (not `title`) remains the title field; legacy `steps` column dropped. See `supabase/schema.sql` / SCHEMA.md.
- [x] `src/lib/projects.ts` (new `ProjectStatus`/`ProjectPriority` types, `getProject`/`listChildProjects`/`updateProject`/`computeProjectProgress`) and `src/lib/actions.ts` (new module)
- [x] Projects list page → card grid (status/priority badges, tags, live recursive progress %, due date), name-only quick-capture
- [x] Project detail page (`src/app/projects/[id]/`): inline-editable header fields, progress bar, sub-projects grid, actions list (quick-add, checkbox, 🚩 flag, sort/filter, convert-to-task)
- [x] Convert-to-task flow (soft link via `linked_task_id`, "🔗 linked to task" indicator)
- [x] Task completion prompts (`window.confirm`) to also complete a linked action
- [x] Mark-project-done allows open actions, shows soft warning instead of blocking
- [x] Today view (`/`, home screen): flagged_today actions + tasks, grouped by project for actions; completing clears the flag

Outcome/notes/saves attachment decided 2026-08-05 (DECISIONS.md D-012) — built 2026-08-05:

- [x] `projects.outcome` + `projects.page_id` columns, `pages` table, `project_saves` join table — applied manually in Supabase. See SCHEMA.md / `supabase/schema.sql`.
- [x] `outcome` inline-editable on project detail; shown on the card grid alongside name/status/priority/progress (placeholder when null)
- [x] "Add notes" affordance on project detail → creates a `pages` row, sets `page_id`, navigates into the editor; existing linked page shown as a link instead
- [x] "Attached saves" section on project detail (`project_id` set, `action_id` null) with an attach-a-save picker
- [x] Per-action expand/detail view on project detail (▸/▾ toggle) showing saves attached to that specific action, with its own attach-a-save picker
- [x] Save Manager "Link to project" action per save → project picker → optional action picker, writing to the same `project_saves` table
- [ ] Manually verify all of the above (Projects/Actions/Today AND the new outcome/notes/saves flows) in a live, signed-in browser session — only `npm run build` (TypeScript clean) and unauthenticated dev-server smoke tests have been done so far; the agent environment has no way to complete magic-link auth. See STATUS.md's Known gaps.

## Pages / Notes

Designed pre-rebuild, built from scratch 2026-08-05 (DECISIONS.md D-012) — see STATUS.md for the block-type list and other implementation assumptions made along the way.

- [x] `pages` table (title/emoji/parent_id/content jsonb/created_at/updated_at) — applied manually in Supabase.
- [x] `src/lib/pages.ts` — CRUD, `deletePage()` pre-checks for children and throws a clear error instead of letting the FK restrict fail silently.
- [x] Block editor (`src/components/pages/PageEditor.tsx`): text/heading/checklist/bullet/page_link blocks, 800ms-debounced autosave, flush-before-write ordering guard for sub-page creation.
- [x] Hierarchy nav (`src/components/pages/PagesShell.tsx`): desktop persistent sidebar ≥768px, recursive tree; below 768px the tree is injected into the app-wide shared mobile drawer (unified 2026-08-08 — see STATUS.md's Layout note).
- [x] Slash-command / bottom-sheet block-type menu (`src/components/pages/BlockMenu.tsx`) — same markup, breakpoint-only CSS switch between inline dropdown and bottom sheet.
- [x] Routes `/pages` and `/pages/[id]`; nav item added to `NavShell`.
- [ ] Manually verify in a live, signed-in browser session — entirely untested end-to-end (auth sandbox limitation). See STATUS.md's Known gaps.

## Horizon

- Push notifications for Recurring Items reminders. Needs: VAPID keys, a push subscription table (user_id, endpoint, keys jsonb), service worker `push` event listener (SW already exists, v3), and a scheduler to trigger sends at set times — Railway has no built-in cron, so options are Railway Cron (if plan supports it), an external cron webhook (e.g. cron-job.org), or Supabase pg_cron. In-app reminder only for now.
- Recurring Items calendar heatmap / dedicated progress page — the D-018 build surfaces streak/completion-rate inline on the list only; revisit if that feels cramped once it's in daily use.
- Supabase MCP connector — enables pushing progress notes/updates into My OS directly from Claude chat sessions, without needing Claude Code open.
- The remaining ~10 routes from the old repo: Health & Fitness, Expense Tracker, Goals, Habits, Journal, Content HQ, Contacts, Resources, Vault, Dashboard
- Saves: list/grid toggle, platform filters (the minimal `/saves` route itself is now built, see STATUS.md)
- Offline write queue (blocked pending a decision entry — see the "pending the offline-queue ruling" note carried over in the old repo's SCHEMA.md)
- Export/import
- Real app icons (current icons are placeholders — SVG plus generated PNGs)
- Calendar Phase 2+ (DECISIONS.md D-019 explicitly deferred these): `.ics` import, a share-target extension so calendar invites can be shared into the app the same way links are, Google Calendar sync, recurrence rules on events, drag-to-reschedule in the Month/Agenda views, linking events to projects (mirroring `project_saves`). Promote Calendar from a Today-page tab to its own route if daily use shows the tab feels cramped (same "promote once proven" logic as D-016 → D-018 for Recurring Items).

## Ideas — Second Brain reference (Aug 9)

Sourced from a Notion "Second Brain" template screenshot Dilan shared as original inspiration for My OS. These are unscoped ideas, not committed designs — none have been through a design/decision session yet.

- **Upcoming section — keep it plain**: reference pattern shows the Upcoming list as flat title text only, no dates/badges inline, implicitly sorted. Use as a simplicity anchor when building the due_date-driven Upcoming section (see existing bug-triage item).
- **Project cards show outcome/steps preview on the card face**: currently `outcome` (D-012) only surfaces in project detail. Reference shows an "Actionable Steps" preview directly on the list card. Revisit once current Projects card layout has had real daily-use validation (capture-first discipline, D-002).
- **Alternate view-mode tabs**: Tasks reference has Kanban / Priority / Upcoming tabs over the same data; Projects reference has Current Projects / Timeline tabs. Bigger lift — log as an idea, not yet scoped.
- **Reuse filter-pill pattern beyond Save Manager**: Save Manager's platform filter pills (Aug 5) match a Recent / Category / Favorites pill pattern in the reference's Resources view. Natural extension once Resources goes through its own capture-first pass.
- **Habit Overview as a separate tab from the daily list**: reference keeps a distinct "Overview" tab apart from the checkbox list. Recurring Items (D-018) shipped streak/rate inline on the list instead of a separate tab for now — revisit this reference if inline feels cramped once it's in daily use.
- **Persistent quick-add sidebar** ("Quick Button": New Task / New Project / New Goal / New Contact / New Idea / New Resource): fast capture from anywhere in the app. Overlaps conceptually with the share-target capture path — needs a decision on which capture mechanism is canonical before this gets built, to avoid two competing entry points.

## Done

- [x] Set `SUPABASE_SERVICE_ROLE_KEY` and `NOTED_USER_ID` in Railway Variables and `.env.local`, then verify the live share-sheet round trip — 2026-08-04: confirmed working end-to-end (LinkedIn URL shared via Android share sheet landed correctly in Save Manager, auto-detected as LinkedIn). See STATUS.md → Share Target.
