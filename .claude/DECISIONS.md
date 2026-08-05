# DECISIONS.md

Architectural rulings — the *why* behind major technical choices. Newest first. A ruling stands until explicitly superseded by a later entry.

Decision numbers restart at D-001 in this repo. The retired vanilla repo's DECISIONS.md (D-001 through D-008 there) remains valid history; its D-008 is the ruling that created this repo.

---

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