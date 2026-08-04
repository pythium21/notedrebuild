# STATUS.md

What currently exists in the running deployment. This file describes the present only — planned work lives in BACKLOG.md, rationale in DECISIONS.md.

**Last updated: 2026-08-04**

## Deployment

| Thing | State |
|---|---|
| GitHub repo | Created — `pythium21/notedrebuild` |
| Railway service | Live — repurposed the existing NOTED service |
| Production URL | `noted-production-e741.up.railway.app` |
| Supabase project | Live — repurposed the existing NOTED Supabase project |
| Email delivery | Resend, via Supabase custom SMTP (`smtp.resend.com:465`) — replaces Supabase's built-in mailer |
| Custom domain | None |

## App (as of current commit)

- Next.js App Router + TypeScript scaffold, routes: `/tasks`, `/projects`, `/saves`, `/share-target`, all deployed and live. Root `/` redirects to `/tasks` (capture-first: the app opens straight into the task list).
- **Auth**: Supabase magic-link email, gating the whole app client-side via `AuthGate` (`src/components/AuthGate.tsx`). No session → email form; link click signs in. Send/resend button has a 60s cooldown (auto-extended if Supabase itself reports a rate limit) to avoid hammering the mail provider.
- **Data**: `src/lib/tasks.ts`, `src/lib/projects.ts`, `src/lib/saves.ts` wrap all Supabase reads/writes for their table. Pages never call `supabase.from(...)` directly.
- **Tasks**: add (name + optional free-text tag + optional date) via an always-visible input at the top of the list, no modal. Toggle done via checkbox.
- **Projects**: add (name + optional steps text) via the same top-of-list pattern. Status (Planning / In progress / Done) changeable inline via a select.
- **Saves** (DECISIONS.md D-003, deliberate capture-first exception): add (url + optional title + platform select defaulting to auto-detect) via the same top-of-list pattern; list links out to each saved URL. `saves` table pre-existed in the repurposed NOTED Supabase project — columns were confirmed live rather than assumed; see SCHEMA.md. `cleanUrl()` strips `utm_*`/`rcm` tracking params before insert; `detectPlatform()` maps the URL host to one of YouTube / Articles / LinkedIn / Facebook / Reddit / Websites (defaults to Websites).
- **Share target**: `/share-target` receives Android's share sheet via the PWA `share_target` manifest entry (GET, `title`/`text`/`url` params), extracts the first `http(s)` URL from `text` when `url` is empty, POSTs it to the `/api/share-target` route handler, then redirects to `/saves` after ~1.2s. The route handler (`src/app/api/share-target/route.ts`) writes to `saves` via a `service_role` client built inline, stamping `user_id` from the `NOTED_USER_ID` env var — not the browser session (DECISIONS.md D-009; see MISTAKES.md for why this changed). Requires `SUPABASE_SERVICE_ROLE_KEY` and `NOTED_USER_ID` set in Railway and `.env.local`.
- **Add buttons** (Tasks + Projects): guarded against double-submit via an `isAdding` loading state — button disables and reads "Adding…" while the insert is in flight, handler re-entry guarded too. Fixed after a duplicate-row bug; see MISTAKES.md. Saves' add form follows the same pattern.
- **Layout**: bottom nav below 600px, sidebar (with sign-out) at/above 600px. Hand-rolled CSS, no UI library, auto light/dark via `prefers-color-scheme`.
- **PWA**: `public/manifest.json` + `public/sw.js` (app-shell caching only, no offline write queue). `sw.js` serves the navigable HTML document network-first with a cache fallback for offline use, and the static shell assets (manifest, icons) cache-first — see MISTAKES.md for the stale-shell bug this replaced. Web Share Target wired (`share_target` in the manifest → `/share-target`). Installable to an Android home screen; icons are placeholders — `public/icon.svg` plus generated `public/icon-192.png` / `public/icon-512.png` (same blue rounded-square "OS" mark, added so `share_target`/maskable-icon requirements are met) — swap all three for real artwork before shipping.
- Not implemented: everything not listed above. See BACKLOG.md.

## Share Target

- Confirmed working end-to-end (Aug 2026): shared a LinkedIn URL via Android share sheet → landed correctly in Save Manager, auto-detected as LinkedIn. Closes out the "verify live share-sheet round trip" backlog item — `SUPABASE_SERVICE_ROLE_KEY` and `NOTED_USER_ID` env vars confirmed working in Railway.
- Known issue: list view UI doesn't truncate long URLs (see BACKLOG.md).

## Account / Auth

- Non-bug clarified: seeing no data on a device isn't an RLS failure — regular app routes use per-user magic-link auth + RLS, separate from the share-target's hardcoded `NOTED_USER_ID` shortcut. If the wrong account's data appears (or none), sign out and re-request a magic link for the correct account. Confirmed this resolves it.

## Current phase

Daily-use trial. Per the capture-first build order (DECISIONS.md), no new routes get pulled in until Tasks + Projects have been used for real, day-to-day, for about a week.

## Verified working

- Task and project creation persists correctly after a page refresh.
- Repeat add-button testing confirms the double-submit fix: no duplicate inserts on rapid repeat clicks.
- AuthGate's resend-cooldown is deployed and verified working in production: the send/resend button disables for 60s after a send.

## Known gaps (tracked in BACKLOG.md, listed here only for orientation)

- No real app icons (placeholder SVG/PNGs only)
- No offline write queue — Supabase must be reachable to read or write
- No export/import (JSON)
- `saves.platform`/`saves.title` constraint details (NOT NULL/CHECK beyond the standard convention) unverified against the live DB — only column existence was confirmed; see SCHEMA.md
- Three of the original app's ~13 routes exist (Tasks, Projects, Saves) — the remaining ~10 are parked until the daily-use trial above is done
