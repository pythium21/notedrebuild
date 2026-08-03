# DECISIONS.md

Architectural rulings — the *why* behind major technical choices. Newest first. A ruling stands until explicitly superseded by a later entry.

Decision numbers restart at D-001 in this repo. The retired vanilla repo's DECISIONS.md (D-001 through D-008 there) remains valid history; its D-008 is the ruling that created this repo.

---

## D-003 · Save Manager as a deliberate exception to capture-first order (2026-08-03)

D-002 says one route at a time, pulled in by actual usage. Ruling: pull in a minimal Save Manager (`/saves`) and the PWA Web Share Target now, ahead of that order. This is not a reversal of D-002 — the exception is scoped to this one route, justified because sharing a link into the app from Android's share sheet *is itself a capture action*, arguably lower-friction than opening the app and typing (the same bar D-002 sets for Tasks/Projects). Consequence: `saves` becomes the third table, and — unlike tasks/projects, which started from an empty slate — it's built by reconciling against the live Supabase project's pre-existing `saves` table (carried over from the repurposed NOTED project) rather than a fresh-start schema. See SCHEMA.md for what the live table actually contains vs. what was assumed going in.

## D-002 · Capture-first build order (2026-07-31)

The app failed to enter daily use in its previous life partly because breadth preceded habit. Ruling: routes are built one at a time, pulled by actual usage, starting with the capture surfaces (Projects + Tasks). A new route lands only after the existing app has been used for real. The app opens capture-ready — adding an item is never more than two taps from launch; dashboards and review surfaces are secondary. Consequence: BACKLOG.md stays long and that's fine.

## D-001 · Rebuild in Next.js, carrying forward the surviving rulings (2026-07-31)

Origin: the retired vanilla repo's D-008 ruling. My OS is rebuilt as Next.js App Router + TypeScript + Supabase + Railway, matching Protergy conventions. Carried forward from the old repo: the GitHub/Railway/Supabase stack choice (old D-001), magic-link email auth (old D-007), and last-write-wins per row if/when offline sync exists (old D-006's conflict rule — the localStorage half of that ruling does *not* carry over; this app is Supabase-only until an offline-queue ruling is made). Explicitly not carried: hash routing, config.js secret handling, static `serve` (old D-003/D-004/D-005) — replaced by App Router routes, env vars (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `||` fallbacks for Edge Runtime), and Next's own server. The `service_role` key must never exist client-side; any server-side Supabase helper is created inside route handlers only.