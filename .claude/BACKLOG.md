# BACKLOG.md

All open work. **Active** is flat-ranked by priority (top = next). **Horizon** is unranked — ideas parked until pulled in by actual usage, per the capture-first build order in DECISIONS.md D-008 (old repo).

## Active

1. Create the Supabase project, apply `supabase/schema.sql`, wire up real env vars, deploy to Railway, install as a PWA on a phone — use it for a week before touching anything below.
2. Verify on a real device: the Saves screen after the URL-overflow fix (2026-08-08, MISTAKES.md's top entry — root cause confirmed via headless-mobile repro: unbreakable URL titles expanded the layout viewport and dragged the fixed bottom nav off-screen). Expected on-device: bottom nav visible with all 5 items on every screen, no horizontal panning on Saves, long URLs wrap inside their cards. This supersedes the two earlier verification asks (autoFocus theory, `interactiveWidget`-revert theory) — both attributions are superseded in MISTAKES.md.
3. The Notes slash-menu-behind-keyboard problem (#6 in the Aug 6 batch) remains unfixed after the `interactiveWidget: 'resizes-content'` revert (see MISTAKES.md). Needs a scoped approach: a JS `visualViewport` listener that repositions just the block-menu popup above the keyboard, rather than a global viewport-level setting that affects every fixed-position element in the app.
4. Verify `saves` table constraints against the live Supabase dashboard (NOT NULL / CHECK on `platform`, `title`) — only column existence was confirmed via anon-key PostgREST probing when the `/saves` route was built (DECISIONS.md D-003); RLS blocked every insert attempt before a constraint violation could surface, so those details are currently assumed to match the tasks/projects convention rather than confirmed.
5. Fix `manifest.json`'s `share_target` enctype — browser console warns it defaults to `application/x-www-form-urlencoded`; verify the `/share-target` route's expected content type and set `enctype` explicitly, then reinstall the PWA to pick up the manifest change.

## Tasks

P1 — capture-flow gaps found in daily use:

- [x] Edit an existing task (currently entry-only, no edit form) — done 2026-08-04
- [x] Delete a task from the UI (currently requires direct DB access) — done 2026-08-04
- [x] Display created_at on each task in the list view — done 2026-08-04

## Save Manager

P2:

- [x] Fix URL overflow in list view — done 2026-08-08, and it turned out to be far more than cosmetic: the unbreakable-URL overflow was the confirmed root cause of the "unusable Saves screen / missing bottom nav" report (see MISTAKES.md's top entry). Fixed three ways: `overflow-wrap: anywhere` on `.item__name` + `overflow-x: clip` on `.main` (the hard CSS guarantee), `og:title` fetch at save time (DECISIONS.md D-015), and the "Refresh N link titles" backfill button for pre-D-015 rows.
- [ ] Verify on a real device: the "Refresh link titles" button on `/saves` (D-015) — added in response to a report that turned out to be a pre-fix row, not a bug in the fetch itself, but the button itself is unverified against a live signed-in session.

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

- Supabase MCP connector — enables pushing progress notes/updates into My OS directly from Claude chat sessions, without needing Claude Code open.
- The remaining ~10 routes from the old repo: Health & Fitness, Expense Tracker, Goals, Habits, Journal, Content HQ, Contacts, Resources, Vault, Dashboard
- Saves: list/grid toggle, platform filters (the minimal `/saves` route itself is now built, see STATUS.md)
- Offline write queue (blocked pending a decision entry — see the "pending the offline-queue ruling" note carried over in the old repo's SCHEMA.md)
- Export/import
- Real app icons (current icons are placeholders — SVG plus generated PNGs)

## Done

- [x] Set `SUPABASE_SERVICE_ROLE_KEY` and `NOTED_USER_ID` in Railway Variables and `.env.local`, then verify the live share-sheet round trip — 2026-08-04: confirmed working end-to-end (LinkedIn URL shared via Android share sheet landed correctly in Save Manager, auto-detected as LinkedIn). See STATUS.md → Share Target.
