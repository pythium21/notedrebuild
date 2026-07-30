# STATUS.md

What currently exists in the running deployment. This file describes the present only — planned work lives in BACKLOG.md, rationale in DECISIONS.md.

**Last updated: 2026-07-31**

## Deployment

| Thing | State |
|---|---|
| GitHub repo | Not yet created |
| Railway service | Not yet created |
| Supabase project | Not yet created — `supabase/schema.sql` is written but not applied anywhere |
| Custom domain | None |

## App (as of current commit)

- Next.js App Router + TypeScript scaffold, two routes: `/tasks`, `/projects`. Root `/` redirects to `/tasks` (capture-first: the app opens straight into the task list).
- **Auth**: Supabase magic-link email, gating the whole app client-side via `AuthGate` (`src/components/AuthGate.tsx`). No session → email form; link click signs in.
- **Data**: `src/lib/tasks.ts` and `src/lib/projects.ts` wrap all Supabase reads/writes for their table. Pages never call `supabase.from(...)` directly.
- **Tasks**: add (name + optional free-text tag + optional date) via an always-visible input at the top of the list, no modal. Toggle done via checkbox.
- **Projects**: add (name + optional steps text) via the same top-of-list pattern. Status (Planning / In progress / Done) changeable inline via a select.
- **Layout**: bottom nav below 600px, sidebar (with sign-out) at/above 600px. Hand-rolled CSS, no UI library, auto light/dark via `prefers-color-scheme`.
- **PWA**: `public/manifest.json` + `public/sw.js` (app-shell caching only, no offline write queue). Installable to an Android home screen; icon is a placeholder SVG (`public/icon.svg`) — swap for real artwork before shipping.
- Not implemented: everything not listed above. See BACKLOG.md.

## Known gaps (tracked in BACKLOG.md, listed here only for orientation)

- No real app icons (placeholder SVG only)
- No offline write queue — Supabase must be reachable to read or write
- Only two of the original app's ~13 routes exist
