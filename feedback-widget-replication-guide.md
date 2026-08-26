# Tester Feedback Widget — Replication Guide

A portable spec for the floating feedback widget built in this repo (Protergy/Neartrition), for replicating in another Next.js + Supabase codebase. Scoped to the widget + capture pipeline only — no admin/triage dashboard included.

**Stack assumptions:** Next.js App Router, TypeScript, Supabase (Postgres + Auth + Storage), `@supabase/ssr`. Adjust if the target app differs.

---

## 0. Before you start

If the target repo has its own project docs (a `CLAUDE.md`/`AGENTS.md` and any docs it points to — schema reference, decisions log, status doc, etc.), **read them first**, the same way this repo's own `CLAUDE.md` requires reading `SCHEMA.md` before any query and `DECISIONS.md` before any architectural call. Specifically check for:

- The project's Supabase client pattern (e.g. a service-role/singleton gotcha like §3 below) — don't assume this repo's pattern applies verbatim.
- Existing table/column naming conventions, so `tester_feedback` and its columns stay consistent with the rest of the target schema.
- Where DB schema is documented, so you know what to update in step 5.
- Whether the target repo requires migrations to be run manually vs. applied directly — don't assume you can run SQL yourself.

## 1. What it is

- A floating "Feedback" button, visible on every authenticated page, opens a bottom-sheet form (type: bug/idea/general, description, severity for bugs, optional screenshot).
- Submissions insert directly into Supabase from the browser client (RLS-scoped to the submitting user), with screenshots uploaded straight to Storage.
- That's the whole pipeline — this guide doesn't include a review/triage UI. Rows land in the table and can be queried directly (SQL client, a Supabase Table Editor view, or a lightweight admin page you build separately if the target app wants one).

## 2. Database — run manually in your SQL client (not migrated automatically here)

```sql
create table tester_feedback (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id),
  type text not null check (type in ('bug', 'idea', 'general')),
  description text not null,
  severity text check (severity in ('blocker', 'minor')),
  screenshot_path text,
  page_route text,
  place_id text,  -- swap/drop: this was venue-context specific to Neartrition
  status text not null default 'new' check (status in ('new', 'reviewed', 'backlog', 'done', 'dismissed')),
  admin_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table tester_feedback enable row level security;

create policy "users insert own feedback" on tester_feedback
  for insert with check (auth.uid() = user_id);

create policy "users select own feedback" on tester_feedback
  for select using (auth.uid() = user_id);
-- No update/delete policy for regular users. If you later build a way to
-- triage/update these rows, do it via a service-role client server-side —
-- don't loosen this table's RLS to make that work.
```

`status`/`admin_notes` are included because they're cheap to have even without a UI on top of them yet — drop them if the target app has no plan to ever triage this data.

Storage bucket (create via Supabase Dashboard or API — **verify it actually exists before building on top of it**; see the pitfall in §4):

- Name: `feedback-screenshots`
- Private (not public)
- RLS policies on `storage.objects`, scoped to own folder:

```sql
create policy "users upload own screenshots" on storage.objects
  for insert with check (
    bucket_id = 'feedback-screenshots'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "users read own screenshots" on storage.objects
  for select using (
    bucket_id = 'feedback-screenshots'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
```

Object path convention: `{user_id}/{timestamp}.{ext}`.

## 3. Client widget — `src/components/FeedbackWidget.tsx`

`'use client'` component, mounted once in the root layout (`src/app/layout.tsx`, sibling to `{children}`, inside `<body>`):

```tsx
<FeedbackWidget />
```

Behavior:
- Reads the current Supabase session client-side (`supabase.auth.getSession()` + `onAuthStateChange`) to get `userId`. Renders nothing if there's no session, or if `pathname` matches a hidden-route prefix list (e.g. `/login`, `/auth`) — avoids a flash of the button before auth resolves and keeps it off logged-out pages.
- Fixed-position pill button, bottom-right, `z-index` above normal content but below modal/toast layers you may already have.
- Click opens a bottom-sheet overlay (mobile-first: full-width sheet sliding up from the bottom, capped `max-width` on larger screens) with:
  - **Type** — segmented control: Bug / Idea / General.
  - **Description** — textarea, client-side min-length validation (10 chars) surfaced as a hint, not a hard block until submit.
  - **Severity** — only shown when type is Bug: "Blocks me" vs "Annoying but I can continue". Required for bug submissions (`canSubmit` gate).
  - **Screenshot (optional)** — file input restricted to `image/png`, `image/jpeg`, `image/webp`; 5MB cap; client-side validation with inline error text; thumbnail preview via `URL.createObjectURL`.
- Submit flow: if a screenshot was attached, upload it to the Storage bucket first (path `{userId}/{Date.now()}.{ext}`), then insert the `tester_feedback` row with the resulting `screenshot_path` (or `null`). Insert uses the **anon/browser** Supabase client, not a server route — RLS does the authorization.
- On success: brief auto-dismissing toast, close + reset the form. On failure: inline error text in the sheet, form stays open with entered data intact.
- All styling is scoped inline via a `<style>` tag with a unique class prefix (`fbw-*` here) so the widget doesn't leak into or collide with the host app's global CSS — swap the actual colors/fonts to match the target app's theme, keep the prefixing convention.

Adapt/drop for the new app:
- The `place_id`/venue-context field — this repo's app is GPS/venue-centric; a generic app should drop this column or replace it with whatever page-scoped context is actually relevant (e.g. omit entirely, or capture something like `feature_flag_context`).
- `page_route` is genuinely portable — capture `pathname` at submit time for every app, it's cheap and useful for triage later.

## 4. Known pitfalls (from this build — avoid repeating)

- **Don't trust an external build doc's "✅ confirmed live" claims about infrastructure.** In this repo, a spec claimed the Storage bucket + its RLS policies already existed; only the table had actually been created. The gap wasn't caught until screenshot upload was tested. Before building against a bucket/table/extension, check it actually exists in the live DB (`select * from storage.buckets`, `\d tablename`, etc.) rather than trusting a doc.
- **If you later add a service-role route** (e.g. to build a triage view), call the service-role client factory *inside* the handler function, never as a module-level constant — a module-level singleton can silently fall back to the anon key depending on deployment topology, which makes RLS block everything with no visible error.
- Keep the description min-length and severity-required checks client-side only if that matches your app's risk tolerance (this repo does) — there's no server-side re-validation on insert, since the insert goes directly from the browser to Supabase via RLS, not through an API route.

## 5. File checklist to create in the target repo

```
src/components/FeedbackWidget.tsx
```

Plus: mount `<FeedbackWidget />` in the root layout, and run the SQL in §2 against the target Supabase project.

## 6. When you're done

Update the target repo's own docs to reflect the new table/bucket/component, following whatever doc-routing convention it already uses (mirroring this repo's own rule: schema facts go in the schema reference, "what's live" goes in the status doc, and so on):

- Record `tester_feedback` and the `feedback-screenshots` bucket in whatever doc owns DB schema for that repo.
- Mark the widget as live in whatever doc owns "what currently exists" for that repo.
- If you hit and fixed a pitfall not already listed in §4, note it in whatever doc owns confirmed lessons-learned for that repo.

Don't invent new doc files for this if the target repo doesn't already have that structure — just note it wherever that repo currently tracks schema/status, or skip this step if it tracks neither.
