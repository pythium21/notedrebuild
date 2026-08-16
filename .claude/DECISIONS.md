# DECISIONS.md

Architectural rulings — the *why* behind major technical choices. Newest first. A ruling stands until explicitly superseded by a later entry.

Decision numbers restart at D-001 in this repo. The retired vanilla repo's DECISIONS.md (D-001 through D-008 there) remains valid history; its D-008 is the ruling that created this repo.

---

## D-022 · Recurring items gain sub-tracking entries, driving auto-completion (2026-08-16)

**Context:** Some Recurring Items aren't naturally binary — "Drink water" isn't done/not-done, it's 8 cups; "Supplements" is several distinct pills, not one checkbox; "Steps" is a number against a daily goal. The existing `checklist_completions` model (D-016) only supports a single manual toggle per item per day, which forces these into either one undifferentiated checkbox (losing the granularity) or several separate recurring items (losing the single-habit framing). A general-purpose entry-tracking layer lets any recurring item optionally log granular sub-entries that roll up into completion, instead of building a bespoke water-tracker/supplement-tracker/step-counter per habit.

**Decision:**
- **General-purpose, not per-category:** one schema (`entry_configs`/`entry_labels`/`recurring_entries`) serves water, supplements, gym, steps, walking, cycling, meal-prep, and anything future — not a table per habit type.
- **Separate config/labels tables, not JSONB:** `entry_configs` (one per tracked item, mandatory `target`, `type`) and `entry_labels` (the loggable things under it) are real tables rather than a JSONB blob on `checklist_items`, so labels can be queried/joined/extended later (e.g. per-label progress) without a JSON-parsing layer.
- **Three entry types:** `counter` (tap a chip, e.g. "+Cup"), `checklist` (toggle named items, e.g. supplements), `numeric` (type a number against a unit, e.g. steps). One `entry_configs.type` column, not three tables.
- **Target is mandatory, not optional:** every tracked item has a numeric `target` — there's no "tracked but no goal" state, because auto-completion (below) needs a number to compare against.
- **Auto-completion on target, no manual toggle for tracked items:** logging/deleting a `recurring_entries` row recalculates the current period's count and mirrors the result into the *existing* `checklist_completions` table (insert on reaching target, remove on dropping below) — implemented in `src/lib/recurringEntries.ts`'s `recalculateAndSync()`, called from `logEntry()`/`deleteEntry()`. This means streak/completion-rate (`checklist.ts`'s `getStreak()`/`getCompletionRate()`) keep working unchanged for tracked items with zero modification — they just read `checklist_completions` as before, unaware entries exist underneath. Tracked items lose the manual Complete/Uncomplete button in the expanded panel (D-020) — the progress bar drives completion, not a tap.
- **Target period follows item frequency:** daily items reset the count daily (`localToday()`), weekly items reset Monday–Sunday (`currentWeekRange()`). Monthly tracked items aren't in the spec's example list, but `periodRangeForFrequency()` extends the same rule to a calendar month rather than leaving monthly items uncomputed — a reasonable inference from "target frequency follows item frequency," flagged here since it wasn't explicitly specified.
- **Detail panel via BreadcrumbMenu**, matching the existing Calendar day-detail / Project-detail pattern rather than inventing a new panel type: breadcrumb ("Recurring / [item]"), a stat row (count/target for the period, streak-or-rate), a full progress bar, type-specific log controls, and a period log list with per-entry undo (delete).
- **Row click behavior diverges by tracked state:** untracked rows keep D-020's tap-to-expand accordion unchanged. Tracked rows open the BreadcrumbMenu detail panel on tap instead (per spec); Edit/Delete/Archive for a tracked item move behind a small "⋯" button in the row's action strip so the accordion (and those actions) stay reachable — the spec didn't address this collision explicitly, so this is the resolution chosen to avoid losing existing D-020 functionality.
- **Editing an existing tracking config (type/target/labels) after creation is deferred**, not built this round, despite being mentioned in the original ask — `updateEntryConfig()`/label CRUD exist in the lib layer, but there's no UI entry point yet. Tracked as a BACKLOG item rather than half-built behind a gear icon with no way to reach it.
- **Schema:** `entry_configs`, `entry_labels`, `recurring_entries` — SQL appended to `supabase/schema.sql`, applied manually in the Supabase SQL editor per CLAUDE.md's no-migrations-via-Claude-Code rule. Confirmed live 2026-08-16. See SCHEMA.md for full column definitions.
- Renumbered from the spec's own "D-021" label to D-022 — D-021 was already taken by Task Archive (above), committed and confirmed live 2026-08-15 before this spec was implemented.

---

## D-021 · Tasks gain Archive alongside Delete, for completed tasks (2026-08-15)

**Context:** Recurring Items got Archive (D-016, conditionally surfaced by D-020) specifically to preserve `checklist_completions` history — the whole reason Archive exists there is a child table Delete would otherwise cascade away. Tasks have no equivalent history table; a done task's own row *is* the record. Asked directly what Archive should do for a completed task, the answer was "I want history, because I can see what I completed — track performance etc," ruling out a plain "hide it" flag with no way to look back at it: the point is a durable, browsable record of completed work, not just decluttering the active list.

**Decision:**
- **Schema:** `tasks` gains `archived boolean not null default false` and `archived_at timestamptz, nullable` (stamped client-side on archive, cleared on unarchive — matches `pages.updated_at`'s app-stamps-timestamps convention, no DB trigger). SQL appended to `supabase/schema.sql`, to be applied manually in the Supabase SQL editor per CLAUDE.md's no-migrations-via-Claude-Code rule — **not yet applied as of this commit**.
- **Data access:** `listTasks()` and `listTasksInRange()` (the Calendar tab's due-task feed) now filter `archived = false`, so an archived task disappears from the active list and from Calendar due-date rows. A new `listArchivedTasks()` fetches `archived = true`, ordered by `archived_at` descending. `archiveTask()`/`unarchiveTask()` in `src/lib/tasks.ts` toggle the flag and stamp/clear `archived_at`.
- **UI:** `/tasks` gains a third tab, "Archived" (alongside Tasks/Recurring, D-020's tab pattern), showing a flat read-only-ish list — name, tag, "Completed <date>" (from `archived_at`), and a lone Unarchive button per row (no accordion; there's nothing further to drill into) — plus a `.page-hint` count line ("N completed tasks archived") as the one piece of "track performance" visibility asked for. Bigger analytics (weekly/monthly completion charts) was explicitly not what was asked for and isn't built here — the count line is the smallest thing that answers "how much have I gotten done," full stop.
- **Archive entry point:** in a Task's expanded accordion panel (D-020), *only* once `task.done` is true — mirrors Recurring's completed-only Archive condition (D-020's Update) exactly, so both lists read the same way: you can't archive work you haven't finished. Order: Complete/Uncomplete → Edit → Delete → Archive (when eligible).
- **Delete is unchanged and still separate:** Delete remains the hard, unrecoverable removal (D-020); Archive is the new soft path when the point is keeping a record, not getting rid of one.

**Rationale:** Reusing D-020's tab pattern and Recurring's completed-only-Archive condition avoids a third distinct interaction model for what is, at the UI level, the same feature twice. Client-stamped `archived_at` avoids a DB trigger for a single-user app where "set it when the client sets the flag" is exactly as correct and matches the one other precedent (`pages.updated_at`) already in this schema.

**Status:** Active. Schema change (`tasks.archived`/`archived_at`) applied manually in the Supabase SQL editor, confirmed by user 2026-08-15.

---

## D-020 · Recurring Items moves under Tasks as a tab; nav reduced to 5 items; hard delete added alongside archive (2026-08-15)

**Context:** D-018 gave Recurring Items its own top-level route and nav entry, justified at the time by the "reads as another way to add a task" complaint. In daily use that justification didn't hold up the nav slot — Recurring Items is a thin, low-traffic list, and Tasks/Recurring are close enough in shape (both are checkable rows with an add-flow) that a second full nav item for it is more weight than the feature earns. Separately, Recurring Items had no delete at all — D-016's "archive only, never hard-delete" ruling was made when the feature was new and history-preservation felt like the only sane default, but real use surfaced genuine mistakes (wrong frequency, duplicate item, testing junk) that don't deserve to sit archived forever with no way to actually remove them.

**Decision:**
- **Placement:** `/recurring` is removed as a route. `RecurringItems` (`src/components/RecurringItems.tsx`) is now rendered as a second tab on `/tasks` (`src/app/tasks/page.tsx`), alongside the existing Tasks list — same local-state tab pattern as D-019's Today/Calendar tabs (`.today-tabs`/`.chip` reused verbatim, no new toggle style). Tab selection resets on reload, matching D-019.
- **Nav:** `NavShell.tsx`'s nav array drops the "Recurring" (↻) entry. Nav goes from 6 items to 5: Today, Tasks, Projects, Saves, Notes.
- **Delete, alongside archive (partially supersedes D-016's "archive only" ruling):** Recurring Items now support both actions — Archive (soft, preserves completion history, unchanged from D-016) and a new hard Delete (`deleteChecklistItem()` in `src/lib/checklist.ts`, `window.confirm()` per D-010). Delete removes the `checklist_items` row; `checklist_completions` rows are removed via the existing `on delete cascade` FK (SCHEMA.md) — no new schema or manual SQL needed. D-016's rationale for defaulting to archive (preserving streak/rate history) still holds as the *default* destructive action; Delete is the explicit "actually get rid of this" escape hatch for rows that never should have existed, not a replacement for Archive.
- **Row interaction (see also the inline-accordion decision below):** both Tasks and Recurring rows gained tap-to-expand; Edit/Delete (Tasks) and Edit/Delete/Archive (Recurring) moved out of the always-visible row into the expanded detail panel, decluttering the collapsed row.

**Rationale:** Reusing D-019's tab pattern avoids inventing a second placement mechanism for the same "promote once proven, demote if it doesn't earn its slot" judgment call the BACKLOG.md Horizon note already flagged as the natural next move for Calendar. Cascading through the existing FK avoids a schema change entirely — the delete-safety concern D-016 was solving (accidental data loss) is still met, just by requiring an explicit confirm rather than by refusing to ever delete.

**Update (2026-08-15, same day — expand bug + row-interaction refinement):** Recurring's rows didn't actually expand on tap as shipped. Root cause: Recurring's collapsed row has no non-interactive filler area (unlike Tasks, which has a `.item__meta` line) — the `.item__main` label and `.item__actions` div together covered 100% of the row surface, and both called `stopPropagation()` unconditionally, so no click ever reached the row's expand handler. Fixed by scoping `stopPropagation` to just the checkbox itself rather than the whole label, applied to both Tasks and Recurring (Tasks had the same latent flaw, just masked by its meta row giving an escape hatch). Separately, the complete/check toggle moves out of the collapsed row entirely (for both Tasks and Recurring) into the expanded panel as a Complete/Uncomplete button grouped with Edit/Delete — the collapsed row is now purely informational except for the quick-action controls that were already there (🚩 flag for Tasks, ↑/↓ move for Recurring). Recurring's expanded panel also gains a conditional Archive: hidden until the item is completed for today, so the button order reads Complete → Edit → Delete when incomplete, Uncomplete → Edit → Delete → Archive once done — archiving an item you haven't finished today isn't a real workflow, so the option simply isn't offered until it is one. The now-dead `.item--task .item__main input[type='checkbox']` CSS rule was removed.

**Status:** Active. No schema change — relies on the existing `checklist_completions.item_id on delete cascade` FK (SCHEMA.md, confirmed live 2026-08-09/2026-08-12). Supersedes D-018's Placement bullet and the nav-entry consequence of D-016's placement; D-018's schema/rename/UI-fix bullets stand. Partially supersedes D-016's Deletion bullet (archive is no longer the *only* deletion path) — D-016's schema rationale and reset semantics stand.

---

## D-019 · Calendar Phase 1 ships as a Today-page tab, not a Dashboard route (2026-08-12)

**Context:** Requested as a "Dashboard tab," but this app has no Dashboard route — `Dashboard` is still an unbuilt Horizon item carried over from the old repo (BACKLOG.md). The closest thing this app has to a dashboard is the Today page (`/`, DECISIONS.md D-011), which already aggregates flagged tasks/actions and an Upcoming section. Building a new Dashboard route now to house one tab would be a bigger scope jump than the feature needs and cuts against capture-first discipline (CLAUDE.md, D-002) — Dashboard hasn't been pulled in by actual usage yet.

**Decision:**
- **Placement:** Calendar ships as a second tab on the existing Today page (`src/app/page.tsx`), alongside the current "Today" content — not a new route, not a new Dashboard. Tab selection is local component state only, resets on reload (no server persistence needed at this scale).
- **Schema:** new `events` table, fully separate from `tasks` — real appointments/events with `start_time`/`end_time` (`timestamptz`) and an `all_day` flag, distinct from a task's single nullable `date`. `source text not null default 'manual'` is forward-looking for later import paths (share-target, Google sync) without building them now. RLS uses the standard four-policy convention (`events_select_own`/`_insert_own`/`_update_own`/`_delete_own`) matching `projects`/`tasks`/`saves`/`actions`/`pages` — not `checklist_items`'s compact single-policy variant, since that was called out as a deliberate exception, not the default.
- **Task due dates:** surfaced read-only in the calendar (both Month and Agenda views, and the day-detail panel) by querying `tasks.date` (confirmed the actual column name — not `due_date`, which only exists on `actions`/`projects`) in the visible range. No per-task detail page exists in this app, so due-task rows link back to `/tasks` rather than an individual task page.
- **Day-detail panel:** reuses the existing `BreadcrumbMenu` component (`src/components/BreadcrumbMenu.tsx` — desktop dropdown / mobile bottom sheet via CSS breakpoint, already used by Project detail and the Pages editor breadcrumb) rather than introducing a new overlay pattern. Holds that day's events (with quick-add + delete) and due tasks (read-only).
- **View toggle:** Month grid / Agenda list, sharing one visible-month range (both views navigate the same month via prev/next controls — Agenda isn't an independent rolling window). Rendered as chips reusing D-018's `.chip`/`.chip.is-selected` pattern rather than a new toggle style. Agenda skips days with nothing due/scheduled.
- **Explicitly deferred** (BACKLOG.md Horizon): `.ics` import, share-target extension for calendar, Google Calendar sync, recurrence rules, drag-to-reschedule, linking events to projects.

**Rationale:** Reusing Today as the tab host and `BreadcrumbMenu` as the overlay avoids two new architectural patterns (a Dashboard route, a new sheet/dropdown mechanism) for a phase-1 feature whose value is still unproven. The four-policy RLS convention is the actual default in this schema (six of seven prior tables use it); the checklist tables' single-policy shortcut was documented as an intentional one-off, not something to propagate by default.

**Status:** Active. Schema change (`events` table) applied manually in the Supabase SQL editor, confirmed by user 2026-08-12.

---

## D-018 · Recurring Items supersedes Daily Checklist's placement and scope (2026-08-12)

**Context:** D-016's Daily Checklist had three problems surfaced by real use: (1) it was embedded as a card at the bottom of `/tasks` with no route of its own; (2) its single-line add-form was visually identical to a task quick-add, so it read as "another way to add a task" rather than a distinct feature; (3) it only supported daily reset — no weekly/monthly cadence and no progress/streak view, both explicitly deferred in D-016's Scope note.

**Decision:** Supersede D-016's placement and scope, but reuse its schema rather than replace it — `checklist_items`/`checklist_completions` (confirmed live 2026-08-09) are extended, not dropped, so no data loss.
- **Schema:** `checklist_items` gains `frequency` (`daily` | `weekly` | `monthly`, default `'daily'`), `days_of_week` (int array, ISO weekday ints for `weekly`), `day_of_month` (1–31, for `monthly`). Existing rows default to `'daily'`, preserving current behavior with no backfill. `checklist_completions` is unchanged — a completion row still means "done for the due-date that fell on this date"; misses are derived (a past due-date with no completion row), never stored, to avoid drift at single-user scale.
- **Placement:** own top-level route `/recurring`, removed from `/tasks` entirely. Nav gets a new "Recurring" (↻) item after Tasks.
- **Rename:** `DailyChecklist.tsx` → `RecurringItems.tsx` (`RecurringItems` export, `useRecurringItems` hook) — the old name became actively misleading once weekly/monthly cadences exist. `src/lib/checklist.ts` keeps its filename (rename not worth the history churn) but gains `isDueOn`, `getStreak`, `getCompletionRate`, and `listRecurringForToday` (replaces `listChecklistForToday`).
- **UI fix for "feels like adding a task":** the add flow becomes two-step — title, then a *required* frequency choice as three chips (Daily/Weekly/Monthly, not a dropdown, deliberately louder) that reveals a day-of-week or day-of-month picker. List rows show streak (daily) or completion rate (weekly/monthly) inline, muted text under the title — no separate progress page for this pass, revisit only if inline feels cramped in daily use.
- **Explicitly out of scope:** folding into a future "Habits" route — this stays a separate top-level concept until it proves redundant with Habits.

**Rationale:** Reusing the schema avoids a second migration and preserves completion history; deriving misses instead of storing them avoids a second source of truth that could drift from the due-date rules. The chip-based add flow is the cheapest fix for the "reads as a task" complaint — no new interaction pattern, just visual weight.

**Status:** Active. Schema change (`frequency`/`days_of_week`/`day_of_month` on `checklist_items`) applied manually in the Supabase SQL editor, confirmed by user 2026-08-12. Supersedes D-016's Placement and Scope bullets; D-016's Decision (schema rationale, reset semantics, archive-not-delete) stands.

---

## D-017 · Saves gain per-row delete and a binary read/unread toggle (2026-08-09)

**Context:** `/saves` had no way to remove a row or track whether a saved link had actually been consumed — every other list in the app (Tasks, Projects, Pages) already has delete; Saves was the one list missing it. Read-tracking was requested as "read/watched or partially read/watched."

**Decision:** Two additions, both matching existing conventions rather than introducing new patterns:
- **Delete**: per-row "Delete" button with `window.confirm()` (D-010), `deletingId` guard + "Deleting…" label — identical shape to Tasks' delete.
- **Read status**: binary `read boolean not null default false` column (not tri-state, not a percent) — user's explicit choice over in-progress/done or a percent-complete slider, since nothing in the app auto-tracks video timestamp or scroll position, so a percent field would just be a second manual toggle with more UI for no more signal. Shown as a checkbox per row, styled with the same `.is-done` strike-through class Tasks already uses for its done state — no new CSS pattern.

**Rationale:** Both are the smallest change that closes the gap without speculative complexity — no bulk-actions, no "mark all read," no archive-vs-delete distinction (unlike D-016's checklist items, saves have no completion history worth preserving, so a hard delete is fine here).

**Status:** Active. Schema change (`saves.read`) applied manually in the Supabase SQL editor, confirmed by user 2026-08-09.

---

## D-016 · Daily Checklist is a separate system from Tasks (2026-08-09)

**Context:** Recurring personal habits (gym, water, supplements) need a daily-reset checklist with historical completion tracking for future progress/streak views. Tasks are one-off/ad hoc — bolting a `recurring` flag onto `tasks` would conflate two lifecycles (a task is done once; a habit is done again every day) and leave no natural home for per-day history.

**Decision:** Two new tables, fully separate from `tasks` (which is untouched):
- `checklist_items` — the persistent list (`id`, `user_id`, `title`, `sort_order`, `archived`, `created_at`).
- `checklist_completions` — per-day completion log (`id`, `item_id`, `date`, `completed_at`, `unique (item_id, date)`). Checking inserts a row, unchecking deletes it — a boolean on the item would lose history.
- **Reset:** local calendar day (client-computed local date, not UTC, not a rolling 24h window) — simplest, avoids timezone edge cases.
- **Deletion:** archive only (`archived = true`) — completion history is preserved for the future streak view; the UI confirms before archiving and never hard-deletes.
- **Placement:** `src/components/DailyChecklist.tsx` is fully standalone (own `useDailyChecklist` hook, own `src/lib/checklist.ts` data module, no Tasks imports) — embedded in `/tasks` as its own labeled card for now, relocatable to Dashboard/Today by moving one render call.
- **Scope:** this pass is data model + CRUD UI only. No streak/progress view, no push notifications (both → BACKLOG.md).

Note: one `src/lib/checklist.ts` module covers both tables (a deliberate exception to one-module-per-table — completions are meaningless outside the checklist feature, mirroring how `project_saves` got its own module only because multiple pages use it). Data access uses the browser client + RLS like `tasks.ts` — NOT `getSupabaseService()`, which stays confined to the share-target route per D-009.

**Status:** Active. Schema applied manually in the Supabase SQL editor, confirmed by user 2026-08-09 (see supabase/schema.sql). On-device verification tracked in BACKLOG.md.

---

## D-015 · Save titles are backfilled via a server-side link-preview fetch when none is supplied (2026-08-08)

**Context:** Saves created without an explicit title — the manual add form's title field is optional, and many Android share-sheet sources don't populate a title either — defaulted to showing the raw cleaned URL as the title (`src/lib/saves.ts`'s `createSave()`, `/api/share-target`'s insert). Reported as a real usability problem: the list showed unreadable link text instead of anything indicating what was actually saved (e.g. a YouTube video's real title).

**Decision:** Add `src/lib/linkPreview.ts`'s `fetchPageTitle()` — a server-only helper that fetches the target URL, extracts `og:title` (falling back to `<title>`), with an 8s timeout, a 2MB response cap, and a private/loopback-host guard (rejects localhost/RFC1918/link-local hostnames) as SSRF defense-in-depth. The 2MB cap isn't arbitrary — an initial 64KB cap (assuming title tags sit near the top of `<head>`) returned null for YouTube specifically, whose `og:title` sits ~684KB into the document behind a large blob of inlined JSON; verified against real URLs (YouTube, Wikipedia, example.com) before landing on 2MB. Wired into two places: `/api/share-target` (already server-side — calls it directly when the Android share payload doesn't include a title) and a new `/api/link-preview` route (POST `{ url }` → `{ title }`) that the `/saves` add-form calls client-side, before `createSave()`, only when the optional title field was left blank. A plain client-side `fetch()` to an arbitrary external URL would hit CORS for most sites, so this has to go through our own server either way.

**Rationale:** Fetching server-side is the only option that reliably avoids CORS regardless of the target site's own CORS policy. The private-host guard costs little and closes an obvious self-inflicted SSRF footgun (a share intent or pasted URL pointed at Railway's internal network) even though the realistic threat model for a single-user personal app is low. Both title-less code paths still fall back to the raw URL if the fetch fails or times out — this is a best-effort backfill, not a guarantee.

**Update (2026-08-08, same day):** This only fixes titles going forward — rows created before this shipped still had the URL baked into `title` from `createSave()`'s old fallback, which read as "the fix didn't work" when reported against an old row. Added a "Refresh N link titles showing as raw URLs" button on `/saves` (`src/lib/saves.ts`'s `updateSaveTitle()` + a `handleRefreshTitles()` loop in `src/app/saves/page.tsx`) that only touches rows where `title === url` exactly — sequential (not parallel, since this is a rare manual action, not something latency-sensitive), calls the same `/api/link-preview` route per row, best-effort per-row (one failure doesn't stop the rest). Confirmed against the live deployment that the underlying fetch genuinely works for LinkedIn (initially suspected as blocked by anti-scraping — it isn't; two throwaway test URLs that happened to be invalid/404 were the actual cause of that suspicion).

**Update 2 (2026-08-08, later same day):** Raw URLs still surfaced after the above, for two holes: (1) Android share sheets often pass **the URL itself as the `title` param**, so `suppliedTitle` was truthy and the fetch never fired — URL-shaped supplied titles (`/^https?:\/\//`) are now treated as missing in both `/api/share-target` and the `/saves` add-form; (2) the backfill required finding and tapping a button, and its `title === url` exact-match predicate missed rows where the title was a URL variant (e.g. tracking params intact) rather than the exact cleaned url — the predicate is now "title is URL-shaped" (`hasRawUrlTitle()`), and the backfill **auto-runs once per `/saves` visit** (failed rows keep the URL and retry next visit; the manual button remains for progress visibility). Also added a junk-title guard in `fetchPageTitle()`: titles matching login-wall/bot-challenge patterns ("Just a moment…", "Log in or sign up", etc.) return null rather than replacing one useless title with another.

**Update 3 (2026-08-09):** Reddit shares came in with title `"Reddit"` — worse than useless, and not caught by the junk-title guard since it isn't a bot-wall pattern. Diagnostic logging (added first, as a read-only pass) confirmed Reddit's share intent sends **no title at all** for `/r/<sub>/s/<id>` short links, and `fetchPageTitle()`'s HTML scrape was picking up a generic `<title>Reddit</title>` from a client-rendered SPA shell page rather than the real post title. Added `fetchRedditTitle()` in `src/lib/linkPreview.ts`, tried first (before the HTML scrape) whenever the host is `reddit.com`/`redd.it`: appends `.json` to the URL path and reads `title` from Reddit's own public JSON API response, which returns the real post data directly instead of the SPA shell. Falls back to the existing HTML scrape if the `.json` fetch fails or returns an unexpected shape — this is additive, not a replacement path. Not yet confirmed against a live share (network egress from the dev sandbox used to investigate this was itself blocked by Reddit, unrelated to the fix); diagnostic `console.log` calls were left in `fetchRedditTitle()` to confirm against Railway logs on the next real Reddit share.

**Update 4 (2026-08-09):** Update 3's `.json`-first fetch still produced `"Reddit"` titles, and the Railway logs showed **no `[linkPreview]` lines at all** — the one silent exit path (response OK but content-type not JSON) was the culprit. Root cause: `/s/<id>` short links are redirect stubs, and appending `.json` to the *stub* path doesn't survive the redirect — it lands on the canonical comments page as plain HTML. Reworked `fetchRedditTitle()`: resolve the short-link redirect first (`redirect: 'manual'`, read `Location`, host-validated against reddit.com/redd.it and the private-host guard), then append `.json` to the **canonical** `/r/<sub>/comments/<id>/<slug>/` URL. If the JSON fetch still fails (e.g. Reddit blocks the API from datacenter IPs), fall back to humanizing the title slug embedded in the canonical path itself (underscores → spaces) — the slug comes from the same redirect response, so it's available even when every content fetch is blocked. Every exit path now logs. Defense-in-depth: `^reddit$` added to the junk-title patterns (the SPA shell title is a "scrape got nothing" signal, never a real title), and `hasRawUrlTitle()` on `/saves` now also matches `"Reddit"` titles so the rows already polluted by the shell title are picked up by the auto-backfill.

**Update 5 (2026-08-09):** Update 4's layers all failed for one shared reason, confirmed by Railway logs: Reddit's WAF returns 403 to **every anonymous server request from datacenter IPs** — the short-link redirect probe, the `.json` API, `old.reddit.com`, `api.reddit.com`, oembed, even the r.jina.ai reader relay (verified from the dev sandbox, which Reddit blocks identically). The block page itself names the out: a developer token. So: `getRedditToken()` in `src/lib/linkPreview.ts` does a client-credentials OAuth flow against a free Reddit "script" app (`REDDIT_CLIENT_ID` / `REDDIT_CLIENT_SECRET` env vars), caches the token in module scope until ~expiry, and when a token is available the `.json` fetch goes to `oauth.reddit.com` (WAF-exempt, 100 req/min — far beyond single-user needs) with a Bearer header and Reddit's required descriptive User-Agent (`web:my-os-link-preview:v1.0`). Without credentials configured, behavior is unchanged (anonymous attempts, then slug/scrape fallbacks). Requires one-time setup: create a script app at reddit.com/prefs/apps and set the two env vars in Railway.

**Update 6 (2026-08-09):** Update 5's OAuth path is dead on arrival — Reddit no longer allows creating personal script apps. Exhausted the proxy alternatives (Microlink free tier: refused, "antibot protection, upgrade to PRO"; public Redlib instances: bot-walled or down; r.jina.ai: blocked by Reddit). The only network Reddit reliably serves is the user's own phone, and the share-target page already runs there — so `tryClientRedditTitle()` in `src/app/share-target/page.tsx` now attempts the fetch client-side (follow the short-link redirect via `res.url`, then canonical `.json`) before POSTing, passing any resolved title as the supplied title and a `clientNote` diagnostic field either way. **This is an experiment**: it works only if Reddit sends CORS headers to browsers (unverifiable from datacenter IPs, where the WAF 403s before CORS logic runs); if CORS blocks it, the fetch throws instantly, `clientNote` records the failure in Railway logs, and the existing fallbacks run. Verdict pending one real share. The OAuth code from Update 5 stays — harmless without env vars, useful if Reddit's app policy changes back.

**Update 7 (2026-08-09, closes the Reddit investigation):** The Update 6 experiment returned `client-fetch-failed: Failed to fetch` — Reddit sends no CORS headers to browsers, closing the last automated path. Final tally: server-side anonymous (WAF 403 on all hosts), OAuth (personal script apps no longer allowed), third-party fetchers (Microlink/Redlib/Jina all blocked), client-side from the phone (CORS). **Ruling: Reddit titles are entered by the user at share time.** When the share-target POST returns a URL-shaped title (meaning every automated fetch came up empty), the share page shows an optional title input (Save title / Skip, `isSaving` guard per convention) before redirecting; the update goes through a new `PATCH /api/share-target` (`{ id, title }`, same service-role + `NOTED_USER_ID` no-session model as the POST, per D-009). Cleanup in the same change: the client-side fetch experiment and all diagnostic logging removed; anonymous Reddit fetches skipped server-side (`fetchRedditTitle()` returns null without credentials, and Reddit hosts never fall through to the HTML scrape — it's only ever a 403 or the shell title); Reddit rows excluded from the `/saves` auto-backfill (retrying can never succeed and the hammering likely caused Railway's IP to get WAF-flagged in the first place). The Update 5 OAuth code stays dormant in case Reddit's app policy reverts. Pre-existing Reddit rows keep their URL titles — there is no manual title-edit affordance on `/saves` yet (→ BACKLOG.md if wanted).

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