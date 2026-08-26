# SETUP.md

One-time setup walkthrough: GitHub → Supabase → Railway. About 15 minutes.

## 1. GitHub

```bash
cd my-os
git add .
git commit -m "Initial commit: My OS (Next.js scaffold)"
```

Create an empty repo at github.com/new (private is fine), then:

```bash
git remote add origin https://github.com/YOUR-USERNAME/my-os.git
git branch -M main
git push -u origin main
```

`.env.local` is gitignored on purpose — real keys never enter the repo.

## 2. Supabase

1. Create a project at supabase.com (free tier is plenty).
2. **SQL Editor → New query** → paste the entire contents of `supabase/schema.sql` → **Run**. This creates every table the app currently uses (`projects`, `tasks`, `actions`, `pages`, `project_saves`, `saves`, `checklist_items`, `checklist_completions`, `events`, `entry_configs`, `entry_labels`, `recurring_entries` — see SCHEMA.md) with Row Level Security. The file is idempotent (MISTAKES.md) — safe to paste and re-run in full even if some of it has already been applied.
3. **Authentication → Providers** → confirm Email is enabled (default on). Magic link is the sign-in method. Supabase's built-in mailer is rate-limited; production uses Resend via custom SMTP instead (DECISIONS.md D-004) — not required for local dev.
4. **Project Settings → API** → copy:
   - Project URL (`https://xxxx.supabase.co`)
   - the `anon` `public` key (or the newer `sb_publishable_...` key, if that's what your project issues — `supabaseClient.ts` accepts either, see CLAUDE.md)
5. For the Web Share Target flow (`/share-target`, DECISIONS.md D-009) to work, also create a `service_role` key (same API settings page) and pick a fixed user id (`auth.users.id` of the account you'll sign in as) — these become `SUPABASE_SERVICE_ROLE_KEY` and `NOTED_USER_ID` below. Skip this if you don't need share-target locally.

For local development:

```bash
cp .env.example .env.local
# then paste the URL/anon-or-publishable key into .env.local;
# add SUPABASE_SERVICE_ROLE_KEY and NOTED_USER_ID too if you set up share-target
```

## 3. Railway

1. railway.app → **New Project → Deploy from GitHub repo** → pick `my-os`.
2. Railway detects `package.json` and runs `npm run build` then `npm start` (also pinned in `railway.json`). `next start` respects Railway's `$PORT` automatically.
3. In the service → **Variables**, add:
   - `NEXT_PUBLIC_SUPABASE_URL` = your project URL
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` = your anon key (or `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` if that's the format your project issues)
   - `SUPABASE_SERVICE_ROLE_KEY` and `NOTED_USER_ID`, if you're using the Web Share Target flow (DECISIONS.md D-009) — required for `/api/share-target` to write saves
4. **Settings → Networking → Generate Domain** to get a public URL.
5. Back in Supabase: **Authentication → URL Configuration** → set Site URL to your Railway domain so magic links redirect correctly.

Every push to `main` now auto-deploys.

## Verify

- Local: `npm install && npm run dev` → http://localhost:3000 (shows the Today view, DECISIONS.md D-011 — no redirect)
- Sign in via magic link, add a task and a project, confirm they persist across a reload
- Deployed: open your Railway domain, repeat the same check
- Installability: on an Android phone, open the Railway domain in Chrome → menu → "Install app" (or "Add to Home screen") — confirm it launches standalone (no browser chrome)
