# MISTAKES.md

Confirmed post-mortems with a known root cause. Undiagnosed bugs live in BACKLOG.md until root-caused.

## Double-submit on Tasks/Projects Add button created duplicate rows

**Root cause**: The `handleAdd` submit handlers in `src/app/tasks/page.tsx` and `src/app/projects/page.tsx` had no loading state guarding the Supabase insert. A user double-clicking Add (e.g. because the request felt slow) fired two `createTask`/`createProject` calls before the first resolved, inserting two rows.

**Fix**: Added an `isAdding` state per form. The submit handler returns early if `isAdding` is already true (guards re-entry even if the UI hasn't re-rendered yet), sets it before the insert, and resets it in a `finally` block so it clears on both success and error. The Add button is `disabled` while `isAdding` and shows "Adding…" as its label.
