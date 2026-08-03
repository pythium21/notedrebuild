# STATUS.md

What currently exists in the running deployment. This file describes the present only — planned work lives in BACKLOG.md, rationale in DECISIONS.md.

**Last updated: 2026-08-03**

## Deployment

| Thing | State |
|---|---|
| GitHub repo | Created — `pythium21/notedrebuild` |
| Railway service | Live — repurposed the existing NOTED service |
| Supabase project | Live — repurposed the existing NOTED Supabase project |
| Custom domain | None |

## App (as of current commit)

- Next.js App Router + TypeScript scaffold, routes: `/tasks`, `/projects`, `/saves`, `/share-target`, all deployed and live. Root `/` redirects to `/tasks` (capture-first: the app opens straight into the task list).
- **Auth**: Supabase magic-link email, gating the whole app client-side via `AuthGate` (`src/components/AuthGate.tsx`). No session → email form; link click signs in.
- **Data**: `src/lib/tasks.ts`, `src/lib/projects.ts`, `src/lib/saves.ts` wrap all Supabase reads/writes for their table. Pages never call `supabase.from(...)` directly.
- **Tasks**: add (name + optional free-text tag + optional date) via an always-visible input at the top of the list, no modal. Toggle done via checkbox.
- **Projects**: add (name + optional steps text) via the same top-of-list pattern. Status (Planning / In progress / Done) changeable inline via a select.
- **Saves** (DECISIONS.md D-003, deliberate capture-first exception): add (url + optional title + platform select defaulting to auto-detect) via the same top-of-list pattern; list links out to each saved URL. `saves` table pre-existed in the repurposed NOTED Supabase project — columns were confirmed live rather than assumed; see SCHEMA.md. `cleanUrl()` strips `utm_*`/`rcm` tracking params before insert; `detectPlatform()` maps the URL host to one of YouTube / Articles / LinkedIn / Facebook / Reddit / Websites (defaults to Websites).
- **Share target**: `/share-target` receives Android's share sheet via the PWA `share_target` manifest entry (GET, `title`/`text`/`url` params), extracts the first `http(s)` URL from `text` when `url` is empty, saves it automatically on load, then redirects to `/saves` after ~1.2s.
- **Add buttons** (Tasks + Projects): guarded against double-submit via an `isAdding` loading state — button disables and reads "Adding…" while the insert is in flight, handler re-entry guarded too. Fixed after a duplicate-row bug; see MISTAKES.md. Saves' add form follows the same pattern.
- **Layout**: bottom nav below 600px, sidebar (with sign-out) at/above 600px. Hand-rolled CSS, no UI library, auto light/dark via `prefers-color-scheme`.
- **PWA**: `public/manifest.json` + `public/sw.js` (app-shell caching only, no offline write queue). Web Share Target now wired (`share_target` in the manifest → `/share-target`). Installable to an Android home screen; icons are placeholders — `public/icon.svg` plus generated `public/icon-192.png` / `public/icon-512.png` (same blue rounded-square "OS" mark, added so `share_target`/maskable-icon requirements are met) — swap all three for real artwork before shipping.
- Not implemented: everything not listed above. See BACKLOG.md.

## Current phase

Daily-use trial. Per the capture-first build order (DECISIONS.md), no new routes get pulled in until Tasks + Projects have been used for real, day-to-day, for about a week.

## Verified working

- Task and project creation persists correctly after a page refresh.
- Repeat add-button testing confirms the double-submit fix: no duplicate inserts on rapid repeat clicks.

## Known gaps (tracked in BACKLOG.md, listed here only for orientation)

- No real app icons (placeholder SVG/PNGs only)
- No offline write queue — Supabase must be reachable to read or write
- No export/import (JSON)
- `saves.platform`/`saves.title` constraint details (NOT NULL/CHECK beyond the standard convention) unverified against the live DB — only column existence was confirmed; see SCHEMA.md
- Three of the original app's ~13 routes exist (Tasks, Projects, Saves) — the remaining ~10 are parked until the daily-use trial above is done
