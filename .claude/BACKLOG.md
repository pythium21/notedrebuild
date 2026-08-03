# BACKLOG.md

All open work. **Active** is flat-ranked by priority (top = next). **Horizon** is unranked — ideas parked until pulled in by actual usage, per the capture-first build order in DECISIONS.md D-008 (old repo).

## Active

1. Create the Supabase project, apply `supabase/schema.sql`, wire up real env vars, deploy to Railway, install as a PWA on a phone — use it for a week before touching anything below.
2. Custom SMTP for auth emails (Resend, sender on dilan.au) — Supabase's built-in mailer is capped at ~2-4 emails/hr on ALL plans including Pro; hit the limit during initial deploy. Until fixed: use dashboard "Generate link" (Auth → Users) if throttled. Needs: Resend account, SPF/DKIM records on dilan.au DNS, SMTP creds into Supabase Auth → Emails, then raise the email rate limit (unlocks once custom SMTP set).
3. Verify `saves` table constraints against the live Supabase dashboard (NOT NULL / CHECK on `platform`, `title`) — only column existence was confirmed via anon-key PostgREST probing when the `/saves` route was built (DECISIONS.md D-003); RLS blocked every insert attempt before a constraint violation could surface, so those details are currently assumed to match the tasks/projects convention rather than confirmed.

## Horizon

- Notes/Pages editor with Notion-style sub-page nesting (reference implementation parked in the old repo's `reference/nextjs-subpages/` — TypeScript/React, not yet wired into anything)
- The remaining ~10 routes from the old repo: Health & Fitness, Expense Tracker, Goals, Habits, Journal, Content HQ, Contacts, Resources, Vault, Dashboard
- Saves: list/grid toggle, platform filters (the minimal `/saves` route itself is now built, see STATUS.md)
- Offline write queue (blocked pending a decision entry — see the "pending the offline-queue ruling" note carried over in the old repo's SCHEMA.md)
- Export/import
- Real app icons (current icons are placeholders — SVG plus generated PNGs)
