# STATUS.md

What currently exists in the running deployment. This file describes the present only — planned work lives in BACKLOG.md, rationale in DECISIONS.md.

**Last updated: 2026-08-05**

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

- Next.js App Router + TypeScript scaffold, routes: `/`, `/tasks`, `/projects`, `/projects/[id]`, `/saves`, `/pages`, `/pages/[id]`, `/share-target`, all deployed and live. Root `/` is now the Today view (DECISIONS.md D-011) — it no longer redirects to `/tasks`; the bottom nav / sidebar's first item is "Today". Nav now has 5 items (added "Notes" → `/pages`, DECISIONS.md D-012).
- **Auth**: Supabase magic-link email, gating the whole app client-side via `AuthGate` (`src/components/AuthGate.tsx`). No session → email form; link click signs in. Send/resend button has a 60s cooldown (auto-extended if Supabase itself reports a rate limit) to avoid hammering the mail provider.
- **Data**: `src/lib/tasks.ts`, `src/lib/projects.ts`, `src/lib/actions.ts`, `src/lib/saves.ts`, `src/lib/pages.ts`, `src/lib/projectSaves.ts` wrap all Supabase reads/writes for their table. App pages/components never call `supabase.from(...)` directly.
- **Tasks**: add (name + optional free-text tag + optional date) via an always-visible input at the top of the list, no modal. Toggle done via checkbox. Each row has a 🚩 flag toggle (`flagged_today`) that surfaces it on the Today view; marking a task done that has a linked action (via `actions.linked_task_id`) prompts `window.confirm()` to also complete that action.
- **Projects / Actions** (DECISIONS.md D-011, schema applied 2026-08-05): Projects list (`/projects`) is a card grid — title, status badge (active/on_hold/done/archived or "unset"), priority badge (high/medium/low or "unset"), tags, live recursive progress % rolled up through child projects, due date. Quick-capture is name-only (status/priority start null). Project detail (`/projects/[id]`) has inline-editable name/status/priority/due date/tags/description (each field saves on blur/change, optimistic with rollback on error), a progress bar, a sub-projects grid (`parent_id`, `on delete restrict`), and an actions list below: quick-add via Enter, checkbox to complete, sort (created/title/completed) and filter (all/open/completed) controls, a 🚩 flag toggle, and a "Convert to task" button per row that inserts into `tasks` and soft-links via `linked_task_id` (action stays visible, shows "🔗 linked to task" once converted, no copy-and-delete). Setting status to `done` with open actions shows a soft inline warning ("N actions still open") rather than blocking.
- **Today view** (`/`, DECISIONS.md D-011): unified list of `flagged_today` tasks (flat) and `flagged_today` actions (grouped by project, project name links to its detail page). Completing an item from here clears its `flagged_today` flag and removes it from the list.
- **Projects: outcome, notes, saves** (DECISIONS.md D-012, schema applied 2026-08-05): project detail gains an inline-editable `outcome` field (free text, save-on-blur, same pattern as `description`) — also shown on the card grid ("No outcome set yet" when null). An "Add notes" affordance creates a `pages` row, sets `projects.page_id`, and navigates into the Pages editor; once set it shows as a link into that page instead. An "Attached saves" section lists saves linked at the project level (`project_saves.action_id` null) with an attach-a-save picker; each action row has a ▸/▾ expand toggle revealing a same-pattern attached-saves section scoped to that action (`action_id` set). Both attach flows and Save Manager's new "Link to project" action (project picker → optional action picker) write to the same `project_saves` join table via `src/lib/projectSaves.ts`.
- **Pages / Notes** (`/pages`, `/pages/[id]`, DECISIONS.md D-012): built from scratch this round — designed pre-rebuild but never carried over until now. Full block-based editor: `src/components/pages/PagesShell.tsx` (hierarchy nav — persistent sidebar ≥768px, hamburger drawer <768px, recursive tree over a flat `listPages()` fetch), `src/components/pages/PageEditor.tsx` (title/emoji inline-editable, blocks array), `src/components/pages/BlockMenu.tsx` (shared block-type menu — identical markup, CSS alone switches it between an inline dropdown at ≥768px and a bottom sheet at <768px). Writes debounce 800ms after the last edit via a single combined save (title+emoji+content together, tracked in refs to avoid stale-closure bugs); a `flush()` is awaited before any sub-page creation writes to the parent's content, so a fast sub-page creation right after typing can't silently drop the pending parent edit. Deleting a page with children is blocked with a clear message (`src/lib/pages.ts`'s `deletePage()` pre-checks child count, also catches the FK-restrict error code as a fallback) rather than failing silently.
  - **Design assumptions made** (not specified in the original ask, chosen to keep a first working version shippable — flagged per the task's own guidance to make a reasonable call and note it rather than stall):
    - Block type list: `text`, `heading`, `checklist`, `bullet`, `page_link` — the four named as examples in the ask, plus `page_link` (needed to satisfy the explicit "createSubPage() writes to the parent's content" requirement: creating a sub-page inserts a `page_link` block referencing the new page, it doesn't just set `parent_id`).
    - Slash-command trigger: any block whose text starts with `/` opens the block-type menu (no filtering by what follows the `/`); selecting an option converts that block in place if it was empty, or is inserted as a new block after when triggered via the explicit "+" button per block row instead.
    - Sub-page creation is scoped to the in-editor "Sub-page" menu option only (creates the child row, inserts the `page_link` block, flushes+saves, navigates). The sidebar has a separate "+ New page" button for root-level pages (no content mutation needed there). There's no "add child page" affordance directly on the sidebar tree itself yet — only via a parent page's own editor.
    - No rich-text formatting (bold/italic/links-within-text) — each block is a single plain-text field. No drag-to-reorder blocks yet — order is create-order only, blocks can be deleted and re-added but not dragged.
    - "Attach a save" pickers (project/action-level, and Save Manager's project/action pickers) show *all* saves/projects/actions without filtering out already-linked ones — duplicate `project_saves` rows are technically possible if the same save is attached twice; not deduplicated this round.
- **Saves** (DECISIONS.md D-003, deliberate capture-first exception): add (url + optional title + platform select defaulting to auto-detect) via the same top-of-list pattern; list links out to each saved URL. `saves` table pre-existed in the repurposed NOTED Supabase project — columns were confirmed live rather than assumed; see SCHEMA.md. `cleanUrl()` strips `utm_*`/`rcm` tracking params before insert; `detectPlatform()` maps the URL host to one of YouTube / Articles / LinkedIn / Facebook / Reddit / Websites (defaults to Websites).
- **Share target**: `/share-target` receives Android's share sheet via the PWA `share_target` manifest entry (GET, `title`/`text`/`url` params), extracts the first `http(s)` URL from `text` when `url` is empty, POSTs it to the `/api/share-target` route handler, then redirects to `/saves` after ~1.2s. The route handler (`src/app/api/share-target/route.ts`) writes to `saves` via a `service_role` client built inline, stamping `user_id` from the `NOTED_USER_ID` env var — not the browser session (DECISIONS.md D-009; see MISTAKES.md for why this changed). Requires `SUPABASE_SERVICE_ROLE_KEY` and `NOTED_USER_ID` set in Railway and `.env.local`.
- **Add buttons** (Tasks + Projects): guarded against double-submit via an `isAdding` loading state — button disables and reads "Adding…" while the insert is in flight, handler re-entry guarded too. Fixed after a duplicate-row bug; see MISTAKES.md. Saves' add form follows the same pattern.
- **Layout**: bottom nav below 600px, sidebar (with sign-out) at/above 600px. Hand-rolled CSS, no UI library, auto light/dark via `prefers-color-scheme`.
- **PWA**: `public/manifest.json` + `public/sw.js` (app-shell caching only, no offline write queue). `sw.js` serves the navigable HTML document network-first with a cache fallback for offline use, and the static shell assets (manifest, icons) cache-first — see MISTAKES.md for the stale-shell bug this replaced. Web Share Target wired (`share_target` in the manifest → `/share-target`). Installable to an Android home screen; icons are placeholders — `public/icon.svg` plus generated `public/icon-192.png` / `public/icon-512.png` (same blue rounded-square "OS" mark, added so `share_target`/maskable-icon requirements are met) — swap all three for real artwork before shipping.
- Not implemented: everything not listed above. See BACKLOG.md.

## Tasks

- Edit, delete, and created_at display shipped (Aug 2026). Edit uses inline row-to-form toggle (no bottom sheet — no such pattern existed yet elsewhere in the codebase; see D-010 reasoning for the same logic applied to delete). Delete uses window.confirm() per D-010. Client-side Supabase + RLS, same pattern as createTask/setTaskDone — no getSupabaseService() used, since that's reserved for the share-target route's no-session context (D-009).

## Share Target

- Confirmed working end-to-end (Aug 2026): shared a LinkedIn URL via Android share sheet → landed correctly in Save Manager, auto-detected as LinkedIn. Closes out the "verify live share-sheet round trip" backlog item — `SUPABASE_SERVICE_ROLE_KEY` and `NOTED_USER_ID` env vars confirmed working in Railway.
- Known issue: list view UI doesn't truncate long URLs (see BACKLOG.md).

## Account / Auth

- Non-bug clarified: seeing no data on a device isn't an RLS failure — regular app routes use per-user magic-link auth + RLS, separate from the share-target's hardcoded `NOTED_USER_ID` shortcut. If the wrong account's data appears (or none), sign out and re-request a magic link for the correct account. Confirmed this resolves it.

## Current phase

Daily-use trial, extended by DECISIONS.md D-011 and D-012: the Projects/Actions architecture (D-011) and then Projects outcome/notes/saves + the from-scratch Pages/Notes editor (D-012) were built now (2026-08-05) at explicit user direction — the same kind of scoped exception to D-002's "no new routes until used for a week" ordering that D-003 made for Save Manager. Pages/Notes is a genuinely new top-level route pulled forward from BACKLOG.md's Horizon list, not deferred until after a week of Tasks/Projects-only usage.

## Verified working

- Task and project creation persists correctly after a page refresh.
- Repeat add-button testing confirms the double-submit fix: no duplicate inserts on rapid repeat clicks.
- AuthGate's resend-cooldown is deployed and verified working in production: the send/resend button disables for 60s after a send.

## Known gaps (tracked in BACKLOG.md, listed here only for orientation)

- Projects/Actions/Today (D-011) verified only via `npm run build` (TypeScript compiles clean) and a dev-server smoke test of the pre-auth screen — the authenticated flows (card grid, detail page inline editing, quick-add, convert-to-task, Today view) have NOT been manually clicked through yet. Magic-link auth couldn't be completed in the agent sandbox (no email access), so this needs a real walkthrough before being treated as confirmed working, same bar as the "Verified working" section below.
- D-012 work (2026-08-05) — the entire Pages/Notes editor, and the new Projects/Save-Manager integration surfaces — is similarly unverified beyond `npm run build` (clean) and an unauthenticated dev-server smoke test confirming `/pages` and `/pages/[id]` return 200 and render the sign-in screen without a server error. None of the following has been manually clicked through in a signed-in session yet:
  - Pages editor: creating a page, editing each block type, the 800ms debounced autosave actually persisting, the slash-command menu (both the inline desktop dropdown and the mobile bottom sheet), sub-page creation (including the flush-before-write ordering), hierarchy navigation via the sidebar/drawer, and page deletion (both the successful case and the blocked-by-children case).
  - Projects: the `outcome` field's inline save and its card-grid display, the "Add notes" flow end-to-end (page creation → `page_id` set → navigation into the editor), both "Attach a save" pickers (project-level and per-action), and the per-action expand/collapse toggle.
  - Save Manager: the new "Link to project" picker flow (project picker → optional action picker → `project_saves` write).
- No real app icons (placeholder SVG/PNGs only)
- No offline write queue — Supabase must be reachable to read or write
- No export/import (JSON)
- `saves.platform`/`saves.title` constraint details (NOT NULL/CHECK beyond the standard convention) unverified against the live DB — only column existence was confirmed; see SCHEMA.md
- Four of the original app's ~13 routes exist (Tasks, Projects, Saves, Pages/Notes) — the remaining ~9 (see BACKLOG.md Horizon) are parked until the daily-use trial above is done
