# CLAUDE.md

Instructions for Claude Code working in this repository.

## Project

**My OS** — a personal life-management PWA (Notion/Todoist-alternative, single user). Next.js App Router + TypeScript, Supabase (Postgres + Auth + RLS), deployed on Railway. This is a ground-up rebuild of an earlier vanilla-JS My OS repo, which is now retired to reference status. See DECISIONS.md for the ruling.

Scope is deliberately capture-first: Projects and Tasks only, to start. Everything else is pulled in later by actual usage, not built ahead of need.

## Commands

```bash
# Run locally
npm install
npm run dev          # localhost:3000

# Build / production
npm run build
npm start             # respects $PORT (Railway sets this)

# Deploy
git push origin main  # Railway auto-deploys from main

# Supabase schema changes
# Apply supabase/schema.sql via the Supabase SQL editor, then update SCHEMA.md in the same commit
```

No custom server, no API routes yet. If a route handler is added later that needs elevated privileges, the `service_role` client is created **inside that route handler only** — it must never be imported into client-rendered code.

## Doc routing rules

Each fact has exactly one owning file. Never duplicate a fact across files — link to the owner instead.

| File | Owns | Does NOT own |
|---|---|---|
| `BACKLOG.md` | All open work. "Active" = flat-ranked by priority; "Horizon" = unranked ideas | Completed work, bug post-mortems |
| `CLAUDE.md` | Routing rules, commands, conventions (this file) | Any project fact owned elsewhere |
| `DECISIONS.md` | The *why* behind architectural choices | Implementation detail, current state |
| `MISTAKES.md` | Confirmed post-mortems **with known root cause** | Undiagnosed bugs (those live in BACKLOG.md until root-caused) |
| `SCHEMA.md` | Every table/column fact for Supabase | Rationale for schema design (→ DECISIONS.md) |
| `STATUS.md` | What exists in the running deployment right now | Planned work (→ BACKLOG.md), history (→ DECISIONS.md / MISTAKES.md) |

### Conflict resolution

1. If two docs disagree, the **owning file wins** per the table above.
2. If code and SCHEMA.md disagree about the database, **SCHEMA.md wins**; fix the code or update SCHEMA.md in the same commit as the schema change — never let them drift.
3. If STATUS.md disagrees with the running deployment, the deployment is the truth; update STATUS.md immediately.
4. Never resolve a conflict by writing the fact into a second file.

### Update discipline

- Finish a Backlog item → remove it from BACKLOG.md and update STATUS.md in the same commit.
- Diagnose a bug's root cause → move it from BACKLOG.md to MISTAKES.md with the post-mortem.
- Make an architectural choice → add a ruling to DECISIONS.md *before* implementing.
- Touch a table or column → SCHEMA.md changes in the same commit, no exceptions.

## Conventions

- **Structure**: `src/app/` (routes, one folder per feature: `tasks/`, `projects/`), `src/components/` (shared UI: `NavShell`, `AuthGate`), `src/lib/` (data access — one module per table: `tasks.ts`, `projects.ts` — plus `supabaseClient.ts`, the single browser-client helper). Pages call `lib/*` functions; they don't call `supabase.from(...)` directly.
- **No UI library.** Hand-rolled CSS in `src/app/globals.css`: design tokens in `:root`, auto light/dark via `prefers-color-scheme`. Phone-first: bottom nav below 600px, sidebar at/above 600px.
- **Auth**: Supabase magic-link email only, no passwords, no OAuth (DECISIONS.md D-007, carried over from the old repo). `AuthGate` gates the whole app client-side.
- **Secrets**: `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` as env vars (Railway Variables in production, `.env.local` locally, gitignored). `supabaseClient.ts` also falls back to `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` for Supabase projects issuing the newer `sb_publishable_...` key format instead of a legacy anon key — set whichever one your project actually gives you. No `config.js`-style file — that was the old repo's no-build-step workaround and no longer applies. Use `||` not `??` for env fallbacks (a `??` silently accepts an empty string, which an `||` fallback catches — matters at the Edge Runtime boundary).
- **Tasks**: `tag` is free text, commonly a project name, but there is no foreign key to `projects` — keep the relationship loose (see SCHEMA.md once populated).
- **Add/Save form submission**: every create/submit handler needs an `isAdding` (or `isSaving`) boolean state. Set it before the Supabase call, reset it in a `finally` block, guard the top of the handler with an early return if it's already true (don't rely on the disabled button alone — the re-entry guard belongs in the handler), and disable the submit button with a loading label (e.g. "Adding…") while true. See `src/app/tasks/page.tsx` / `src/app/projects/page.tsx` for the reference implementation, and MISTAKES.md for the double-submit bug this prevents.
- Commit messages: imperative, one concern per commit.
