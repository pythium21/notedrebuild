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
2. **SQL Editor → New query** → paste the entire contents of `supabase/schema.sql` → **Run**. This creates `projects` and `tasks` with Row Level Security.
3. **Authentication → Providers** → confirm Email is enabled (default on). Magic link is the sign-in method.
4. **Project Settings → API** → copy two values:
   - Project URL (`https://xxxx.supabase.co`)
   - `anon` `public` key

For local development:

```bash
cp .env.example .env.local
# then paste the URL and anon key into .env.local
```

## 3. Railway

1. railway.app → **New Project → Deploy from GitHub repo** → pick `my-os`.
2. Railway detects `package.json` and runs `npm run build` then `npm start` (also pinned in `railway.json`). `next start` respects Railway's `$PORT` automatically.
3. In the service → **Variables**, add:
   - `NEXT_PUBLIC_SUPABASE_URL` = your project URL
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` = your anon key
4. **Settings → Networking → Generate Domain** to get a public URL.
5. Back in Supabase: **Authentication → URL Configuration** → set Site URL to your Railway domain so magic links redirect correctly.

Every push to `main` now auto-deploys.

## Verify

- Local: `npm install && npm run dev` → http://localhost:3000 (redirects to `/tasks`)
- Sign in via magic link, add a task and a project, confirm they persist across a reload
- Deployed: open your Railway domain, repeat the same check
- Installability: on an Android phone, open the Railway domain in Chrome → menu → "Install app" (or "Add to Home screen") — confirm it launches standalone (no browser chrome)
