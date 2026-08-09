# DECISIONS.md

Architectural rulings — the *why* behind major technical choices. Newest first. A ruling stands until explicitly superseded by a later entry.

Decision numbers restart at D-001 in this repo. The retired vanilla repo's DECISIONS.md (D-001 through D-008 there) remains valid history; its D-008 is the ruling that created this repo.

---

## D-015 · Save titles are backfilled via a server-side link-preview fetch when none is supplied (2026-08-08)

**Context:** Saves created without an explicit title — the manual add form's title field is optional, and many Android share-sheet sources don't populate a title either — defaulted to showing the raw cleaned URL as the title (`src/lib/saves.ts`'s `createSave()`, `/api/share-target`'s insert). Reported as a real usability problem: the list showed unreadable link text instead of anything indicating what was actually saved (e.g. a YouTube video's real title).

**Decision:** Add `src/lib/linkPreview.ts`'s `fetchPageTitle()` — a server-only helper that fetches the target URL, extracts `og:title` (falling back to `<title>`), with an 8s timeout, a 2MB response cap, and a private/loopback-host guard (rejects localhost/RFC1918/link-local hostnames) as SSRF defense-in-depth. The 2MB cap isn't arbitrary — an initial 64KB cap (assuming title tags sit near the top of `<head>`) returned null for YouTube specifically, whose `og:title` sits ~684KB into the document behind a large blob of inlined JSON; verified against real URLs (YouTube, Wikipedia, example.com) before landing on 2MB. Wired into two places: `/api/share-target` (already server-side — calls it directly when the Android share payload doesn't include a title) and a new `/api/link-preview` route (POST `{ url }` → `{ title }`) that the `/saves` add-form calls client-side, before `createSave()`, only when the optional title field was left blank. A plain client-side `fetch()` to an arbitrary external URL would hit CORS for most sites, so this has to go through our own server either way.

**Rationale:** Fetching server-side is the only option that reliably avoids CORS regardless of the target site's own CORS policy. The private-host guard costs little and closes an obvious self-inflicted SSRF footgun (a share intent or pasted URL pointed at Railway's internal network) even though the realistic threat model for a single-user personal app is low. Both title-less code paths still fall back to the raw URL if the fetch fails or times out — this is a best-effort backfill, not a guarantee.

**Update (2026-08-08, same day):** This only fixes titles going forward — rows created before this shipped still had the URL baked into `title` from `createSave()`'s old fallback, which read as "the fix didn't work" when reported against an old row. Added a "Refresh N link titles showing as raw URLs" button on `/saves` (`src/lib/saves.ts`'s `updateSaveTitle()` + a `handleRefreshTitles()` loop in `src/app/saves/page.tsx`) that only touches rows where `title === url` exactly — sequential (not parallel, since this is a rare manual action, not something latency-sensitive), calls the same `/api/link-preview` route per row, best-effort per-row (one failure doesn't stop the rest). Confirmed against the live deployment that the underlying fetch genuinely works for LinkedIn (initially suspected as blocked by anti-scraping — it isn't; two throwaway test URLs that happened to be invalid/404 were the actual cause of that suspicion).

**Update 2 (2026-08-08, later same day):** Raw URLs still surfaced after the above, for two holes: (1) Android share sheets often pass **the URL itself as the `title` param**, so `suppliedTitle` was truthy and the fetch never fired — URL-shaped supplied titles (`/^https?:\/\//`) are now treated as missing in both `/api/share-target` and the `/saves` add-form; (2) the backfill required finding and tapping a button, and its `title === url` exact-match predicate missed rows where the title was a URL variant (e.g. tracking params intact) rather than the exact cleaned url — the predicate is now "title is URL-shaped" (`hasRawUrlTitle()`), and the backfill **auto-runs once per `/saves` visit** (failed rows keep the URL and retry next visit; the manual button remains for progress visibility). Also added a junk-title guard in `fetchPageTitle()`: titles matching login-wall/bot-challenge patterns ("Just a moment…", "Log in or sign up", etc.) return null rather than replacing one useless title with another.

**Update 3 (2026-08-09):** Reddit shares came in with title `"Reddit"` — worse than useless, and not caught by the junk-title guard since it isn't a bot-wall pattern. Diagnostic logging (added first, as a read-only pass) confirmed Reddit's share intent sends **no title at all** for `/r/<sub>/s/<id>` short links, and `fetchPageTitle()`'s HTML scrape was picking up a generic `<title>Reddit</title>` from a client-rendered SPA shell page rather than the real post title. Added `fetchRedditTitle()` in `src/lib/linkPreview.ts`, tried first (before the HTML scrape) whenever the host is `reddit.com`/`redd.it`: appends `.json` to the URL path and reads `title` from Reddit's own public JSON API response, which returns the real post data directly instead of the SPA shell. Falls back to the existing HTML scrape if the `.json` fetch fails or returns an unexpected shape — this is additive, not a replacement path. Not yet confirmed against a live share (network egress from the dev sandbox used to investigate this was itself blocked by Reddit, unrelated to the fix); diagnostic `console.log` calls were left in `fetchRedditTitle()` to confirm against Railway logs on the next real Reddit share.

**Update 4 (2026-08-09):** Update 3's `.json`-first fetch still produced `"Reddit"` titles, and the Railway logs showed **no `[linkPreview]` lines at all** — the one silent exit path (response OK but content-type not JSON) was the culprit. Root cause: `/s/<id>` short links are redirect stubs, and appending `.json` to the *stub* path doesn't survive the redirect — it lands on the canonical comments page as plain HTML. Reworked `fetchRedditTitle()`: resolve the short-link redirect first (`redirect: 'manual'`, read `Location`, host-validated against reddit.com/redd.it and the private-host guard), then append `.json` to the **canonical** `/r/<sub>/comments/<id>/<slug>/` URL. If the JSON fetch still fails (e.g. Reddit blocks the API from datacenter IPs), fall back to humanizing the title slug embedded in the canonical path itself (underscores → spaces) — the slug comes from the same redirect response, so it's available even when every content fetch is blocked. Every exit path now logs. Defense-in-depth: `^reddit$` added to the junk-title patterns (the SPA shell title is a "scrape got nothing" signal, never a real title), and `hasRawUrlTitle()` on `/saves` now also matches `"Reddit"` titles so the rows already polluted by the shell title are picked up by the auto-backfill.

**Status:** Active.

---

## D-014 · Mobile hamburger/drawer becomes a shared app-wide shell, not a Notes-only pattern (2026-08-08)

**Context:** Aug 6 bug-triage flagged "Notes has its own hamburger drawer, other sections don't" as inconsistent design. The instinctive fix would be to strip the hamburger out of Notes, but Notes' drawer is the only way to browse the page tree on mobile — removing it would remove real functionality, not just inconsistency. Investigation also found the drawer's actual bug: `NavShell`'s sidebar switches to desktop mode at `600px`, but Notes' drawer only switched at `768px`, so between 600–767px both could render at once.

**Decision:** Generalize the hamburger+drawer pattern into `NavShell` itself (`src/components/NavShell.tsx`), which already wraps every route identically, rather than removing it from Notes. A new `DrawerContext` (`src/components/DrawerContext.tsx`) lets any page inject custom content into the shared drawer via `usePageDrawerContent()`; pages that don't inject anything get an empty "Nothing here yet." fallback. Notes is the only current consumer — it feeds its page tree into the shared drawer instead of maintaining a separate hamburger/topbar/drawer implementation. The breakpoint mismatch is resolved as a side effect: the shared drawer now switches off at `600px`, matching the sidebar exactly.

**Rationale:** A per-page drawer implementation was never going to stay consistent with the app shell over time — a shared mechanism means Today/Tasks/Projects/Saves can each opt into drawer content later (content TBD) without re-solving the topbar/overlay/breakpoint/focus mechanics Notes already had to solve once. Matches the same "one shared shell, pages plug into it" shape as `NavShell` itself.

**Update (2026-08-08):** The injection mechanism carries a hard contract discovered the painful way: content passed to `usePageDrawerContent()` **must be memoized** (`useMemo`), and the provider's callbacks are kept referentially stable to make that possible — a fresh node per render causes an infinite update loop that freezes the injecting route (post-mortem in MISTAKES.md). The contract is documented on the hook itself; any future page opting into drawer content must follow it.

**Status:** Active.

---

## D-013 · Today page gains an Upcoming section fed by a new `actions.due_date` column (2026-08-08)

**Context:** Aug 6 bug-triage found the Today page only ever surfaced items explicitly flagged for today — nothing let you see what was coming up. Tasks and Projects already had a `date`/`due_date` column; Actions didn't.

**Decision:** Add `actions.due_date date` (nullable), applied manually via the Supabase SQL editor per CLAUDE.md's no-migrations-via-Claude-Code convention. The Today page (`src/app/page.tsx`) now fetches upcoming (not-yet-flagged, not-done/completed) tasks, actions, and projects with a due date in the future, merges and sorts them client-side by date, and renders them in a new "Upcoming" section below the flagged-today section.

**Rationale:** Deliberately excludes anything already flagged/completed from Upcoming so nothing duplicates between the two sections. Excludes `done`/`archived` projects the same way. Actions stay "deliberately simpler than tasks" per D-011 in every other respect (still no priority) — `due_date` is the one field pulled over, scoped narrowly to what Upcoming needs.

**Status:** Active.

---

## D-012 · Projects gain outcome, notes, and saves attachment (supersedes checklist-only model from D-010/D-011) (2026-08-05)

**Context:** D-010/D-011 shipped Projects as a card-grid + action-tracker (name, status, priority, due_date, tags, description, parent_id, direct actions, child projects, computed progress %). Real usage immediately surfaced a gap: a project like "Home Renovation" needs to hold reference information (fence measurements), track what success actually looks like (not just % complete), and attach externally-shared content (a Colorbond fencing product link shared via the PWA share target) — none of which "just add an action" supports. Additionally, the Pages/Notes feature this relies on was designed prior to the Next.js rebuild but never actually implemented in the current repo, so this decision also covers building it from scratch.

**Decision:**

1. **Outcome field.** `projects.outcome` (text, nullable) — free-form one-to-two-sentence description of what success looks like for the project. Distinct from and additive to the existing `description` field: `description` = what the project is about, `outcome` = the target being worked toward. Progress % computation is UNCHANGED — still `completed / total actions`, rolled up recursively through child projects. Outcome is descriptive context, not a computation input.

2. **Notes via linked Page (on-demand, not eager; full block editor).** `projects.page_id` (uuid, nullable, FK → `pages.id`, on delete set null). No page is created automatically at project-creation time. The project detail page shows an "Add notes" affordance when `page_id` is null; tapping it creates a new row in the `pages` table and sets `page_id` on the project. The Pages feature itself is a full block-based editor (not a plain textarea) — blocks stored as a jsonb array on `content`, 800ms debounced writes, hierarchical via `parent_id` (on delete restrict), responsive (bottom sheet + hamburger drawer under 768px, sidebar + slash command at desktop widths). Built from scratch this round since it predates the Next.js rebuild and was never carried over.

3. **Saves attachment via join table.** New table `project_saves`: `id` (uuid), `project_id` (uuid, required, FK → projects, on delete cascade), `save_id` (uuid, required, FK → saves, on delete cascade), `action_id` (uuid, nullable, FK → actions, on delete set null), `created_at`. A save can be linked at the project level (`action_id` null) or scoped down to one specific action within the project (`action_id` set) — the action-level link implies project membership too, no ambiguity, no duplicate row needed.
   - `saves` table itself is untouched — no `project_id` added directly. A save can exist unlinked, or link to multiple projects/actions over time via this join table.
   - Sharing flow is unchanged: content shared via the PWA share target always lands in Save Manager first, full stop. There is no project-picker at share-time.
   - Linking happens after the fact, from either direction: from Save Manager, pick a project (and optionally an action) for an existing save; from a project or action detail view, pick an existing save to attach. Both entry points write to the same `project_saves` join table — one mechanism, two doorways.

4. **Card grid surfaces outcome.** The Projects card-grid view gains `outcome` as a visible field (alongside existing name, status, priority, progress). Notes (linked page) and attached saves are NOT shown on the grid or in the quick-add action flow — both only surface once you tap into the project or action detail view, keeping the fast-capture flows exactly as lean as before.

**Rationale:** Keeps three genuinely different concerns cleanly separated using patterns already proven elsewhere in the app — Pages for rich content (matches existing parent_id/hierarchy pattern from prior design work), a join table for saves (matches the many-to-many reality that one save could relate to zero, one, or several projects), and a plain text field for outcome (no need to over-engineer a target/success schema when free text does the job). Nothing about the existing D-010/D-011 action-tracking or progress-rollup model changes — this is additive, not a rebuild.

**Status:** Active.

## D-011 · Projects gain a child `actions` entity; Tasks stay fully independent (2026-08-05)

**Context:** BACKLOG.md's Projects section had an open question since Aug 2026: creation-only Projects had no detail view, and steps typed at creation never surfaced again. Planning session resolved this by designing a Projects/Actions architecture rather than bolting a checklist field onto `projects`.

**Decision:**
- Tasks and Projects remain fully independent — no `project_id` column on `tasks`. The existing `tag` free-text convention (SCHEMA.md) is the only loose link between them.
- Projects get a new child entity, `actions`, for project-scoped work items — deliberately simpler than Tasks (no due date, no priority).
- An Action can be promoted to a standalone Task via a soft link (`actions.linked_task_id`), not a copy-and-delete. The Action stays visible with a "linked to task" indicator.
- Progress % is never stored as a column — always computed live as `completed / total` actions, rolled up recursively through child projects.
- `parent_id` on `projects` mirrors the existing Pages hierarchy pattern parked in the retired repo (`on delete restrict`, so a parent can't be deleted while children exist). A project can hold both direct actions and child projects simultaneously, same as Pages.

**Rationale:** Keeps Tasks (personal, flat, priority/due-date-bearing) and Projects (hierarchical, deliverable-tracking) as separate mental models instead of merging them, which the "no FK, `tag` is a loose link" convention already implied was intentional. The soft-link promotion path (vs. copy-and-delete) preserves the Action's history and avoids duplicate-then-orphan bugs. Computing progress live avoids a stored-percentage column going stale relative to its own child rows — same reasoning as not storing `done` counts anywhere else in this schema.

**Note:** logged as D-011, not D-010 as originally specified — D-010 (native `confirm()` for destructive actions) was already taken as of 2026-08-04. Decision numbers are sequential per this file's own rule; renumbering an existing entry would break that.

**Status:** Active.

## D-010 · Destructive actions use native confirm() until a real pattern is needed (2026-08-04)

**Context:** Implementing task delete required a confirmation step before a destructive Supabase call. No destructive-action UX pattern existed anywhere in the codebase yet.

**Decision:** Use the browser's native `window.confirm()` for delete confirmation rather than building a custom confirmation modal/pattern.

**Rationale:** Simplest option that satisfies "don't delete without confirmation." Building a reusable confirm-dialog component now would be premature for a single call site. Revisit if/when more routes (Projects, Contacts, Vault, etc.) need destructive actions and the native dialog's lack of styling/undo starts to feel inconsistent across the app.

**Status:** Active. Superseded if a dedicated confirmation pattern is introduced later — log that as a new decision, don't edit this one.

## D-009 · Share-target writes go through a service-role route handler, not the client session (2026-08-04)

The Web Share Target (`/share-target`) was implemented calling `createSave()` client-side, which depends on `supabase.auth.getUser()` finding a live browser session — the same session `AuthGate` gates the rest of the app behind. This was an unintentional gap, not a documented exception: nothing in this file scoped it, and D-001 already established the intended pattern (`service_role` created inside a route handler only, never client-side) for exactly this kind of case. An Android share-sheet navigation isn't guaranteed to carry a persisted, live Supabase session in that browsing context, making the client-session path an unreliable place to depend on auth for a single-user app. Ruling: `/share-target` (`src/app/share-target/page.tsx`) now POSTs the shared URL/title to a new route handler, `src/app/api/share-target/route.ts`, which builds a `service_role` Supabase client inline (never exported/imported into client code) and stamps `user_id` from a fixed `NOTED_USER_ID` env var instead of a session lookup. Consequence: two new server-only env vars (`SUPABASE_SERVICE_ROLE_KEY`, `NOTED_USER_ID`) are required in Railway and `.env.local`; `src/lib/saves.ts`'s `createSave()` is unchanged and still used by the signed-in `/saves` add-form.

## D-004 · Resend as the transactional email provider for magic-link auth (2026-08-03)

Supabase's built-in SMTP is rate-limited to a few emails/hour with slow delivery, which made magic-link sign-in unreliable (BACKLOG.md flagged this after hitting the limit during initial deploy). Ruling: use Resend as the transactional email provider, wired in through Supabase's custom SMTP setting (`smtp.resend.com:465`) rather than Supabase's own mailer. Resend's free tier (3,000 emails/month, verified sending domain) gives fast, reliable delivery. This is configuration only, done through the Supabase dashboard's Auth → Emails settings — no application code changes, no new env vars, no repo impact.

## D-003 · Save Manager as a deliberate exception to capture-first order (2026-08-03)

D-002 says one route at a time, pulled in by actual usage. Ruling: pull in a minimal Save Manager (`/saves`) and the PWA Web Share Target now, ahead of that order. This is not a reversal of D-002 — the exception is scoped to this one route, justified because sharing a link into the app from Android's share sheet *is itself a capture action*, arguably lower-friction than opening the app and typing (the same bar D-002 sets for Tasks/Projects). Consequence: `saves` becomes the third table, and — unlike tasks/projects, which started from an empty slate — it's built by reconciling against the live Supabase project's pre-existing `saves` table (carried over from the repurposed NOTED project) rather than a fresh-start schema. See SCHEMA.md for what the live table actually contains vs. what was assumed going in.

## D-002 · Capture-first build order (2026-07-31)

The app failed to enter daily use in its previous life partly because breadth preceded habit. Ruling: routes are built one at a time, pulled by actual usage, starting with the capture surfaces (Projects + Tasks). A new route lands only after the existing app has been used for real. The app opens capture-ready — adding an item is never more than two taps from launch; dashboards and review surfaces are secondary. Consequence: BACKLOG.md stays long and that's fine.

## D-001 · Rebuild in Next.js, carrying forward the surviving rulings (2026-07-31)

Origin: the retired vanilla repo's D-008 ruling. My OS is rebuilt as Next.js App Router + TypeScript + Supabase + Railway, matching Protergy conventions. Carried forward from the old repo: the GitHub/Railway/Supabase stack choice (old D-001), magic-link email auth (old D-007), and last-write-wins per row if/when offline sync exists (old D-006's conflict rule — the localStorage half of that ruling does *not* carry over; this app is Supabase-only until an offline-queue ruling is made). Explicitly not carried: hash routing, config.js secret handling, static `serve` (old D-003/D-004/D-005) — replaced by App Router routes, env vars (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `||` fallbacks for Edge Runtime), and Next's own server. The `service_role` key must never exist client-side; any server-side Supabase helper is created inside route handlers only.