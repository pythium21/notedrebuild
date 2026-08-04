# BACKLOG.md

All open work. **Active** is flat-ranked by priority (top = next). **Horizon** is unranked — ideas parked until pulled in by actual usage, per the capture-first build order in DECISIONS.md D-008 (old repo).

## Active

1. Create the Supabase project, apply `supabase/schema.sql`, wire up real env vars, deploy to Railway, install as a PWA on a phone — use it for a week before touching anything below.
2. Verify `saves` table constraints against the live Supabase dashboard (NOT NULL / CHECK on `platform`, `title`) — only column existence was confirmed via anon-key PostgREST probing when the `/saves` route was built (DECISIONS.md D-003); RLS blocked every insert attempt before a constraint violation could surface, so those details are currently assumed to match the tasks/projects convention rather than confirmed.
3. Fix `manifest.json`'s `share_target` enctype — browser console warns it defaults to `application/x-www-form-urlencoded`; verify the `/share-target` route's expected content type and set `enctype` explicitly, then reinstall the PWA to pick up the manifest change.

## Tasks

P1 — capture-flow gaps found in daily use:

- [x] Edit an existing task (currently entry-only, no edit form) — done 2026-08-04
- [x] Delete a task from the UI (currently requires direct DB access) — done 2026-08-04
- [x] Display created_at on each task in the list view — done 2026-08-04

## Save Manager

P2:

- [ ] Fix URL overflow in list view — long URLs (e.g. LinkedIn URNs) run off-screen instead of truncating. Options: CSS ellipsis/truncate (cheap), fetch og:title at save time and display that instead (nicer, more work), or show domain + truncated path as a middle ground.

## Projects

- [ ] OPEN QUESTION: Projects currently only supports create (title + optional steps string + status dropdown). No detail view — steps typed at creation never surface again, can't be checked off, edited, or added to after creation. Need to decide: does tapping a project open a detail page with an editable steps/checklist, expand inline, or something else? Decide before building further. Flagged Aug 2026.

## Horizon

- Notes/Pages editor with Notion-style sub-page nesting (reference implementation parked in the old repo's `reference/nextjs-subpages/` — TypeScript/React, not yet wired into anything)
- The remaining ~10 routes from the old repo: Health & Fitness, Expense Tracker, Goals, Habits, Journal, Content HQ, Contacts, Resources, Vault, Dashboard
- Saves: list/grid toggle, platform filters (the minimal `/saves` route itself is now built, see STATUS.md)
- Offline write queue (blocked pending a decision entry — see the "pending the offline-queue ruling" note carried over in the old repo's SCHEMA.md)
- Export/import
- Real app icons (current icons are placeholders — SVG plus generated PNGs)

## Done

- [x] Set `SUPABASE_SERVICE_ROLE_KEY` and `NOTED_USER_ID` in Railway Variables and `.env.local`, then verify the live share-sheet round trip — 2026-08-04: confirmed working end-to-end (LinkedIn URL shared via Android share sheet landed correctly in Save Manager, auto-detected as LinkedIn). See STATUS.md → Share Target.
