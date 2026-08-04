# MISTAKES.md

Confirmed post-mortems with a known root cause. Undiagnosed bugs live in BACKLOG.md until root-caused.

## Double-submit on Tasks/Projects Add button created duplicate rows

**Root cause**: The `handleAdd` submit handlers in `src/app/tasks/page.tsx` and `src/app/projects/page.tsx` had no loading state guarding the Supabase insert. A user double-clicking Add (e.g. because the request felt slow) fired two `createTask`/`createProject` calls before the first resolved, inserting two rows.

**Fix**: Added an `isAdding` state per form. The submit handler returns early if `isAdding` is already true (guards re-entry even if the UI hasn't re-rendered yet), sets it before the insert, and resets it in a `finally` block so it clears on both success and error. The Add button is `disabled` while `isAdding` and shows "Adding…" as its label.

## Installed PWA briefly showed a stale app shell before real content painted

**Root cause**: `public/sw.js`'s `fetch` handler served `/`, `/manifest.json`, and the icons purely cache-first (`caches.match(event.request).then((cached) => cached || fetch(event.request))`), with no TTL and no revalidation against the network. Once a device's service worker precached `/` on install, it kept serving that exact snapshot — including whichever JS/CSS chunk references were live at install time — on every subsequent launch, indefinitely. Cache invalidation only happened when `sw.js` itself changed (a `CACHE_NAME` bump forces install → activate → purge of old cache keys); a normal app deploy never touches `sw.js`, so returning PWA users stayed pinned to an old shell. This read as a flash of outdated/placeholder content before the real page took over, even though local dev (no service worker involved) never reproduced it and no literal seed/demo data exists anywhere in the codebase — confirmed by checking the production HTML directly, which contains no baked-in task/project content.

**Fix**: Navigation requests (`event.request.mode === 'navigate'`, i.e. the HTML document) now go network-first, with the cache used only as an offline fallback and refreshed from each successful network response. Cache-first is kept only for the static, rarely-changing assets (manifest, icons). `CACHE_NAME` bumped to `my-os-shell-v3` so already-installed clients purge the old frozen entry on next activation.

## Web Share Target wrote to `saves` via the client browser session instead of the service-role pattern

**Root cause**: `/share-target` (`src/app/share-target/page.tsx`) called `createSave()` from `src/lib/saves.ts`, which relies on `supabase.auth.getUser()` finding a live browser session — the same session `AuthGate` gates the rest of the app behind. This was never a documented exception (checked DECISIONS.md — nothing scoped it), and it contradicted D-001's own ruling that any server-side-privileged Supabase access be a route-handler-only `service_role` client. An Android share-sheet navigation isn't guaranteed to carry a persisted, live session in that browsing context, making this an unreliable dependency for a single-user app's most auth-fragile entry point.

**Fix**: See DECISIONS.md D-009. `/share-target` now POSTs to a new route handler (`src/app/api/share-target/route.ts`) that builds a `service_role` client inline and stamps `user_id` from a fixed `NOTED_USER_ID` env var, bypassing session lookup entirely.
