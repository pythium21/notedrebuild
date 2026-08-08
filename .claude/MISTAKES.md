# MISTAKES.md

Confirmed post-mortems with a known root cause. Undiagnosed bugs live in BACKLOG.md until root-caused.

## Add-task/add-save/add-project inputs auto-popped the mobile keyboard on every page load

**Root cause**: The "add" form inputs in `src/app/tasks/page.tsx`, `src/app/saves/page.tsx`, and `src/app/projects/page.tsx` (the *add* forms specifically — not the inline-edit form in Tasks, which correctly uses `autoFocus` only when a user taps "edit", or the sign-in screen / picker-modal search inputs elsewhere in the app, which fire on an explicit full-screen gate or user-triggered modal open rather than routine navigation) had `autoFocus` set unconditionally. It fired every time the page mounted, not just when the user intended to add something. On mobile this popped the on-screen keyboard immediately on navigation, which was also very likely (pending on-device confirmation, see BACKLOG.md) the cause of a separate-looking report that Saves' bottom nav was missing — the auto-popped keyboard shrinks the mobile viewport, pushing the fixed-position bottom nav off-screen until the keyboard closes, rather than the nav itself having a bug.

**Fix**: Removed `autoFocus` from all three add-form inputs. Tasks and Saves were fixed 2026-08-08 as part of the original triage batch; Projects' add-form had the identical bug but was missed in that sweep — caught and fixed separately, same day.

## Notes' hamburger drawer used a different breakpoint than the app shell's sidebar, so both could show at once

**Root cause**: `src/components/pages/PagesShell.tsx` built its own hamburger/topbar/drawer for mobile page-tree navigation, switching to its desktop persistent sidebar at `768px`. `NavShell` (`src/components/NavShell.tsx`, wraps every route) switches its own sidebar on at `600px`. Between 600px and 767px, both the app sidebar and Notes' own drawer/topbar could be visible simultaneously — a genuinely different mobile nav pattern on `/pages` than every other route, exactly as reported.

**Fix**: See DECISIONS.md D-014. The hamburger/drawer mechanism moved into `NavShell` itself via a new `DrawerContext`, generalized to every route (empty by default) rather than staying Notes-specific; Notes now injects its page tree into the shared drawer via `usePageDrawerContent()`. The shared drawer switches off at `600px`, matching the sidebar exactly — no more dual-breakpoint gap.

## Double-submit on Tasks/Projects Add button created duplicate rows

**Root cause**: The `handleAdd` submit handlers in `src/app/tasks/page.tsx` and `src/app/projects/page.tsx` had no loading state guarding the Supabase insert. A user double-clicking Add (e.g. because the request felt slow) fired two `createTask`/`createProject` calls before the first resolved, inserting two rows.

**Fix**: Added an `isAdding` state per form. The submit handler returns early if `isAdding` is already true (guards re-entry even if the UI hasn't re-rendered yet), sets it before the insert, and resets it in a `finally` block so it clears on both success and error. The Add button is `disabled` while `isAdding` and shows "Adding…" as its label.

## Installed PWA briefly showed a stale app shell before real content painted

**Root cause**: `public/sw.js`'s `fetch` handler served `/`, `/manifest.json`, and the icons purely cache-first (`caches.match(event.request).then((cached) => cached || fetch(event.request))`), with no TTL and no revalidation against the network. Once a device's service worker precached `/` on install, it kept serving that exact snapshot — including whichever JS/CSS chunk references were live at install time — on every subsequent launch, indefinitely. Cache invalidation only happened when `sw.js` itself changed (a `CACHE_NAME` bump forces install → activate → purge of old cache keys); a normal app deploy never touches `sw.js`, so returning PWA users stayed pinned to an old shell. This read as a flash of outdated/placeholder content before the real page took over, even though local dev (no service worker involved) never reproduced it and no literal seed/demo data exists anywhere in the codebase — confirmed by checking the production HTML directly, which contains no baked-in task/project content.

**Fix**: Navigation requests (`event.request.mode === 'navigate'`, i.e. the HTML document) now go network-first, with the cache used only as an offline fallback and refreshed from each successful network response. Cache-first is kept only for the static, rarely-changing assets (manifest, icons). `CACHE_NAME` bumped to `my-os-shell-v3` so already-installed clients purge the old frozen entry on next activation.

## Web Share Target wrote to `saves` via the client browser session instead of the service-role pattern

**Root cause**: `/share-target` (`src/app/share-target/page.tsx`) called `createSave()` from `src/lib/saves.ts`, which relies on `supabase.auth.getUser()` finding a live browser session — the same session `AuthGate` gates the rest of the app behind. This was never a documented exception (checked DECISIONS.md — nothing scoped it), and it contradicted D-001's own ruling that any server-side-privileged Supabase access be a route-handler-only `service_role` client. An Android share-sheet navigation isn't guaranteed to carry a persisted, live session in that browsing context, making this an unreliable dependency for a single-user app's most auth-fragile entry point.

**Fix**: See DECISIONS.md D-009. `/share-target` now POSTs to a new route handler (`src/app/api/share-target/route.ts`) that builds a `service_role` client inline and stamps `user_id` from a fixed `NOTED_USER_ID` env var, bypassing session lookup entirely.
