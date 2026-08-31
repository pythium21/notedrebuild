# NOTEBOOKS-SCOPE.md

Scoping notes for a **Notebooks** feature on top of the existing Pages/Notes system — a
OneNote-style notebook container with parent/child page nesting and the ability to link to
other pages within (and across) a notebook.

Status: **architecture decided, nothing built.** Ruled on in DECISIONS.md D-030
(2026-08-31) — this document is the pre-decision analysis D-030 was based on; treat it as
supporting detail, not the source of truth, if the two ever disagree (D-030 wins per
CLAUDE.md's conflict rules). Written 2026-08-28, revised 2026-08-31.

### Scope assumptions

- **One user at launch.** This is a private, single-user deployment; signup, invitations,
  sharing, teams, roles, and other multi-user product flows are out of scope.
- **Still authenticated and owner-scoped.** Single-user does not mean publicly accessible:
  all notebook and page reads/writes require an authenticated session, and database RLS
  plus application checks must restrict records to their `user_id` owner.
- **Keep a multi-user-compatible data model.** Retain `user_id` ownership on notebooks and
  pages and avoid hard-coded global-owner assumptions. This adds little complexity now and
  leaves a clean path to support multiple isolated users later.
- **Existing notes may be discarded.** This feature does not need to migrate or preserve
  current `pages` data. Development data can be reset and the new schema can start clean.

---

## 1. What exists today

The Pages/Notes feature (DECISIONS.md D-012, built 2026-08-05) already covers parent/child
page relationships. What it lacks is a notebook-level container and a way to link an
*existing* page.

| Piece | Current state |
|---|---|
| `pages` table | `id, user_id, title (default 'Untitled'), emoji (nullable), parent_id (uuid nullable, self-FK, on delete restrict), content (jsonb Block[]), created_at, updated_at`. One flat table. Hierarchy is arbitrary depth via `parent_id`. RLS: 4 owner-scoped policies. |
| Blocks (`content` jsonb) | `text`, `heading`, `checklist`, `bullet`, `page_link`. A `page_link` block stores `{ id, type: 'page_link', pageId }` and renders the target page's title/emoji live (looked up from the flat page list, never a copied string). |
| `page_link` creation | **Only** via the slash-menu / "+" block menu → "Sub-page". That flow creates a child `pages` row (`parent_id` set) *and* inserts a `page_link` block into the current page *and* navigates to the child. There is no "link to an existing page" action, no inline `[[wikilink]]`, and no backlinks. |
| Routes | `/pages` and `/pages/[id]` — both render `<PagesShell>`. `page.tsx` passes `pageId` (null for the index). |
| `PagesShell` | Fetches **all** pages flat via `listPages()`, builds one recursive tree from `parent_id` (`rootPages` = `parent_id` null). Desktop persistent sidebar ≥768px; below 768px the tree is injected into the app-wide shared drawer via `usePageDrawerContent` (memoised — MISTAKES.md has an infinite-render-loop history here). "+ New page" creates a root page. No "add child page" affordance on the tree itself. |
| `PageEditor` | Receives the whole `allPages` forest as a prop. Uses it for: the breadcrumb (`getAncestors()` walks `parent_id` to root), the sibling switcher in the breadcrumb dropdown (`allPages.filter(p => p.parent_id === page.parent_id)`), and **`page_link` title resolution** (`allPages.find(p => p.id === block.pageId)`). Title/emoji inline-editable; 800ms debounced combined autosave; `flush()` awaited before any sub-page write (D-012 ordering guard). "Delete page" blocked when the page has children (`deletePage()` pre-checks child count, also catches FK-restrict `23503`). |
| `src/lib/pages.ts` | `listPages()`, `listChildPages(parentId)`, `getPage(id)`, `createPage({title, parent_id})`, `createSubPage(parentId, title)`, `updatePage(id, partial)`, `deletePage(id)`. All RLS-scoped, no `userId` params. |

So "parent/child" is done. The gaps are: **(a)** a notebook container, and **(b)** link-to-existing-page.

## 2. What "like OneNote" means here

OneNote's model is Notebook → Section (/ Section Group) → Page → Subpage — a fixed 3–4
level hierarchy with a distinct entity type at each level, plus "Copy link to page" for
cross-page links and a nav UI with a notebook switcher, section tabs, and a page list.

The user's ask, verbatim: *"create notebooks, as in parent, child relationships, create
links to pages within notebook. similar to onenote."*

Reading that against what already exists:

1. **Notebooks** — a top-level grouping that holds pages. This is the genuinely new part.
2. **Parent/child** — already present via `parent_id`; the ask is to frame it around a
   notebook root.
3. **Links to pages within a notebook** — link to *any existing* page, not just
   auto-created sub-pages.

**Recommendation: do not replicate OneNote's rigid Notebook/Section/Page levels.** The app
already has flexible arbitrary-depth nesting, which is more capable and less code. A
notebook + arbitrary page nesting, with the tree UI making it *feel* sectioned, is the
better fit.

## 3. The core architectural fork — what *is* a notebook?

### Option A — a notebook is a distinguished `pages` row

Treat any `parent_id IS NULL` page as a notebook, or add `pages.kind ('notebook' | 'page')`.

- **Pros:** near-zero schema change; reuses every bit of the existing hierarchy, editor,
  breadcrumb, and tree code.
- **Cons:** a notebook and a page are the same shape, so notebook-level properties (color,
  cover, description) bloat the `pages` row; there's no real notebook list, just a forest;
  "which notebook is this page in" means walking `parent_id` to the root every time.

### Option B — a separate `notebooks` table  **(recommended)**

```
notebooks
  id          uuid pk default gen_random_uuid()
  user_id     uuid not null            -- authenticated owner; 4 owner-scoped RLS policies
  title       text not null default 'Untitled'
  emoji       text, nullable           -- or `color text` for a cover tint, or both
  sort_order  int not null default 0   -- manual notebook order (self-healing by index, like checklist_items)
  created_at  timestamptz not null default now()
  updated_at  timestamptz not null default now()   -- stamped by the app, like pages.updated_at

pages   (add one column)
  notebook_id  uuid not null  references notebooks(id)   -- see delete story, §5 point 3
```

`pages.parent_id` keeps doing **within-notebook** nesting; `parent_id IS NULL` now means
"top-level page *in this notebook*". Every page belongs to exactly one notebook.

- **Pros:** clean mental model; notebook-scoped queries (`listPages(notebookId)`); a real
  notebook switcher / grid; matches the app's "one `src/lib` module per table" instinct;
  closest to what "notebooks like OneNote" actually implies.
- **Cons:** bigger change — every `pages` query, the `PageEditor` `allPages` prop contract,
  and the routes need updating. Existing page data can be dropped, so no data backfill or
  compatibility migration is required.

**Recommendation: Option B**, with NOT NULL `notebook_id` and `user_id` ownership retained
on both notebooks and pages. Reset the existing development data and apply a clean schema
change; do not build an existing-note migration or compatibility path. Create the launch
user's first notebook through setup/onboarding or a small idempotent bootstrap flow rather
than embedding a permanent singleton notebook in application logic. Apply the schema
manually in the Supabase SQL editor per CLAUDE.md and update SCHEMA.md in the same commit.

## 4. Links to pages within a notebook

Three separable pieces, in increasing cost. The first is worth doing on its own,
independent of the notebook decision.

| Piece | Rough cost | Why |
|---|---|---|
| 4a "Link to page" action | **~an afternoon**, low risk | Additive. `page_link` block type, its rendering, its title resolution, and its keyboard-skip handling all already exist — you're just adding a second producer of the same block, wired to the existing `Picker`. No schema, no migration, no lib change. One new flow to test. |
| 4c Backlinks / "Linked from" | **~half a day**, low risk | Pure derivation over data already loaded — filter pages whose `content` has a `page_link` to this id (O(pages × blocks), trivial at personal scale). One small footer component. No schema. Gets expensive only if you also want block-level anchors (link to a paragraph) — that needs stable block ids in the URL and scroll-to-block. |
| 4b Inline `[[wikilinks]]` | **multi-day**, high risk | The editor is plain-`<textarea>`/`<input>` per block (`value={block.text}`). Inline links need a rich-text model (text + link spans) or `contentEditable`, which forces a rewrite of block rendering, **all** keyboard handling (`handleBlockKeyDown`'s Enter/Shift-Enter/Backspace logic reads `el.selectionStart`/`el.value` on a single element), focus/cursor management (`pendingFocusRef`, `setSelectionRange`), the `/` slash trigger, and autosave serialization — plus a `[[` autocomplete popup and id-backed tokens that re-render on title change. Destabilises an editor that currently works; would spawn its own DECISIONS.md entry. |

Ordering: **4a ≪ 4c ≪≪ 4b.** 4a and 4c are safe, additive, and independent; 4b is a
different project.

### 4a. "Link to page" action — small, no schema change  **(do first)**

- Add a `link-page` option to `BLOCK_OPTIONS` / the slash + "+" block menu.
- On select, open the existing `Picker.tsx` (searchable list-select modal, already used for
  saves/projects/actions pickers) scoped to pages — default to pages in the current
  notebook, with an "all notebooks" toggle (see 4d).
- Insert a `page_link` block with the chosen `pageId`. **Reuses the existing block type
  and its live-title rendering.** No `pages` schema change, no migration.
- Simpler than sub-page creation: it's a `commitBlocks` + `scheduleSave`, no cross-row
  write, so the D-012 flush-before-write guard doesn't apply.

### 4b. Inline `[[wikilinks]]` — a separate project, deferred

The editor explicitly has no rich text — "each block is a single plain-text field" (D-012
assumptions in STATUS.md). Every block renders as a native `<textarea>` (text) or
`<input type="text">` (heading/checklist/bullet) with `value={block.text}`. A native input
can only hold a flat string; it cannot render a clickable, styled token mid-text. So inline
links are not a small addition — they change what the editor *is*.

**Rendering approach — pick one, all costly:**

1. **`contentEditable` surface.** Mixed inline content (text nodes + link elements) for
   free, but you inherit contentEditable's whole problem set: Range/Selection APIs instead
   of `selectionStart`, browser-specific DOM mutations on every keystroke, paste
   sanitisation, caret placement around inline atoms, IME composition events, mobile
   keyboard quirks. In practice this means adopting an editor library (TipTap/ProseMirror,
   Lexical, Slate) — a dependency the app has deliberately avoided ("No UI library",
   everything hand-rolled). Reversing that for this surface needs its own DECISIONS.md
   entry.
2. **Invisible textarea + a highlighted "mirror" div** drawn behind it (the syntax-
   highlight-a-textarea hack). No new dependency, but fragile: the mirror must match
   textarea metrics (font, padding, wrap, line-height) exactly or the caret drifts; the
   link tokens aren't really clickable (the textarea is on top) so you need click-through
   handling; breaks under mobile zoom.
3. **Marker-in-text, parsed at render.** Store `text` as a string containing a token like
   `[[title|UUID]]` or `⟦page:UUID⟧`; render *read* mode parsed into text + `<Link>` spans,
   but *edit* mode stays a plain textarea showing the raw marker. Least invasive — roughly
   an afternoon — but the UX is markdown-source editing: you see `[[Roadmap|a1b2…]]` while
   typing, not a chip. Not "like OneNote".

**Data model.** `Block.text?: string` no longer suffices for (1)/(2). You move to something
like `richText?: InlineNode[]` (`[{type:'text', value:'See '}, {type:'page_link',
pageId:'…'}, {type:'text', value:' for details'}]`). Then every reader of `block.text` —
rendering, `handleBlockTextChange`, the `/` slash detection (`value.startsWith('/')`), the
Backspace-empty check (`!block.text`), the textarea autoresize effect, focus restoration —
has to handle both shapes, or you migrate every existing block (a content migration over
every row's `content` jsonb).

**Keyboard handling rewrite.** Every branch of `handleBlockKeyDown` assumes one native
element with `.value` / `.selectionStart` / `.selectionEnd`:
- Enter ("split here, new block") becomes splitting an `InlineNode[]` at a caret offset
  that can fall between nodes.
- Shift+Enter soft break is currently free from `<textarea>`; you'd re-implement it.
- Backspace-at-start ("is the block empty", "is caret at 0") becomes Range checks; and
  Backspace just before a link token should delete the token as an atom, not merge into it.
- Arrow keys past a link atom — contentEditable places the caret inside inline elements
  inconsistently across browsers.

**`[[` autocomplete popup.** Detect `[[`, anchor a popup at the caret's pixel coords
(Range `getClientRects()` or a measurement span), filter the page list as the query is
typed, replace `[[query` with a token on select, close on Escape / click-away. This popup
has the **same "hidden behind the mobile keyboard" bug already open as BACKLOG.md Active
#3** for the existing block menu — so it ships with an unsolved problem unless #3 is fixed
first.

**Sync-on-rename.** Store `pageId`, not the title string, in the token; resolve the
current title from `allPages` at render (same as `page_link` blocks today). Good — renames
propagate — but it means the stored form is a marker, which rules out the "just store
markdown" simplification if you also want live titles.

**Also:** paste handling (linkify pasted `[[…]]` or `/pages/<id>` URLs; strip HTML when
pasting into contentEditable); undo (native textarea undo is free and is the app's only
undo today — contentEditable/custom models lose it unless you build it); autoresize with
wrapped rich lines.

**Knock-on.** Contained to the Notes editor (nothing else touches `pages`). But a rich-text
editor is the kind of thing every other plain-`<textarea>` surface (task notes, project
description) then wants — scope-creep risk.

**Estimate.** With an editor library: ~2–4 days for a competent integration including the
page-link node, the autocomplete, the block-model migration, and mobile testing — plus a
new dependency, bundle cost, and a decision entry reversing "no UI library" here.
Hand-rolled (approach 2 or 3): similar-or-more time and worse robustness. Either way it is
a distinct project, not a phase of this one.

**Cheaper middle grounds if inline linking is wanted sooner:**
- Approach 3 above (visible marker while editing, parsed in a read/preview toggle) — an
  afternoon, deliberately plain UX.
- An `@`-at-start-of-an-empty-block trigger that converts the block to a `page_link` —
  effectively 4a with a keyboard shortcut instead of the slash menu, keeps the plain-text
  model entirely.
- Accept block-level links only (what 4a delivers). Notion shipped only block-level page
  links for a long time.

### 4c. Backlinks / "Linked from" — phase 3

"What links to this page" is computable by scanning every page's `content` for `page_link`
blocks with this `pageId`. Cheap at personal scale — a client-side pass over the already-
loaded page list. Render as a "Linked from" footer on the editor. No schema change if done
by scan; a maintained index is overkill here.

### 4d. Cross-notebook links — allow them

A `page_link` block just stores `pageId`, so cross-notebook links resolve fine by id even
if a page later moves notebooks. Recommendation: **allow**, but have the Picker default to
current-notebook scope with a toggle to search all. OneNote allows cross-notebook links
too.

## 5. Decision points to settle before building

1. **Notebook as its own table (B) or reframed root page (A)?** → recommend **B**.
2. **`pages.notebook_id` NOT NULL or nullable (orphan pages allowed)?** → **NOT NULL**.
   Existing notes may be discarded, so reset the data and start with a clean schema rather
   than implementing a backfill migration.
3. **Delete-a-notebook behaviour?** Options:
   - DB `on delete restrict` + an app flow that makes you empty the notebook first —
     safe but tedious for a whole notebook of pages.
   - `on delete cascade` + a strong `window.confirm("Delete this notebook and all N
     pages?")`.
   - A `service_role` route handler that deletes the notebook and its pages behind a
     confirm (D-009's inline-service-role pattern; D-010's native-confirm rule). Would be
     the app's 3rd route handler after share-target and link-preview.
   → lean toward the **service-role handler**, or cascade-with-confirm if that's judged
   heavy. This is a real open decision.
4. **Can a `page_link` cross notebooks?** → recommend **yes** (see 4d).
5. **Inline `[[wikilinks]]` / rich text?** → **no** for now; block-level `page_link` only.
6. **Backlinks?** → **phase 3**, client-side scan.
7. **Manual page ordering (`pages.sort_order`)?** Pages currently sort by `title` only.
   OneNote is manual order. → probably **yes** if doing notebooks properly; adds a column
   and a reorder UI.
8. **Routes.** Recommendation: keep `/pages/[id]` (a page id is globally unique; the shell
   resolves the notebook from the page row — so existing `page_link` hrefs keep working)
   and add `/notebooks` (notebook list/grid) + `/notebooks/[id]` (opens that notebook's
   tree / first page). Avoids a redirect layer and a mass href rewrite.
9. **Nav.** Nav has 5 items (Today, Tasks, Projects, Saves, Notes). No new item needed —
   the "Notes" entry points at the notebook list. Possibly rename "Notes" → "Notebooks".

## 6. Security and future scale boundary

The launch product has one user, but its security boundary is still per authenticated
owner:

- Require authentication before rendering or mutating notebook/page data; unauthenticated
  requests must not fall back to a shared or default user.
- Enable owner-scoped RLS on both tables for select, insert, update, and delete. Inserts
  must bind ownership to `auth.uid()`; callers must not be able to assign another owner.
- Verify that a page's `notebook_id` refers to a notebook owned by the same user. Enforce
  this in the database where practical, not only in the UI.
- Keep privileged/service-role credentials server-only and use them only for narrowly
  scoped operations that cannot be expressed safely through the authenticated client.
- Do not build invitations, sharing, organizations, roles, or account switching now.
  Future multi-user support should initially mean isolated private accounts; collaboration
  and shared notebooks would require a separate authorization model and scope decision.

## 7. Main implementation subtlety

`PageEditor` reads the whole `allPages` forest for the breadcrumb, the sibling switcher,
**and `page_link` title resolution**. If the tree becomes notebook-scoped but a `page_link`
points to a page in another notebook, its title won't resolve from a notebook-scoped list
and it renders as "Untitled".

**Fix:** `PagesShell` keeps a global `listPages()` for link/title resolution *and* a
`notebook_id` filter for the tree, siblings, and breadcrumb ancestry. i.e. two derived
views over one fetch, not two fetches.

Also:
- The `usePageDrawerContent` memo deps in `PagesShell` (`[pages, pageId, loading,
  isCreating, closeDrawer]`) must be extended carefully if notebook state is added —
  MISTAKES.md documents an infinite-render loop that froze the Notes route when this memo
  was wrong.
- `getAncestors()` already guards against `parent_id` cycles with a `seen` set — keep that.
- A `page_link` to a deleted page currently renders "Untitled" (the `find` returns
  undefined). Acceptable; could be improved to "(deleted page)". Minor.

## 8. Phasing

### Phase 1 — "Link to existing page"
No schema change, no migration. Add the block-menu option, wire `Picker` over the page
list, insert a `page_link` block. Independently shippable and immediately useful.

### Phase 2 — Notebooks entity
- `notebooks` table + `pages.notebook_id` (NOT NULL) + owner-scoped RLS. Reset existing
  note data and apply the clean schema; no content backfill or preservation migration.
- `src/lib/notebooks.ts` (CRUD, one-module-per-table convention).
- `PagesShell` notebook scoping (global fetch + notebook filter, per §7); notebook
  list/grid view (reuse the Projects card-grid pattern); notebook switcher (reuse
  `BreadcrumbMenu`); "New notebook" and "New page in notebook".
- Notebook delete story (resolve §5 point 3).
- Update `getAncestors()` / sibling logic to the notebook-scoped list.
- Routes `/notebooks`, `/notebooks/[id]`; keep `/pages/[id]`.
- Docs: new DECISIONS.md entry (write it *before* implementing, per CLAUDE.md),
  SCHEMA.md (same commit as the schema change), STATUS.md, BACKLOG.md.

### Phase 3 — polish
- Backlinks / "Linked from" footer.
- Cross-notebook link Picker toggle ("this notebook" / "all").
- "Add child page" affordance directly on sidebar tree nodes (today it's only via a
  parent page's own slash menu).
- Move-page-to-another-notebook action.
- Notebook color / cover.
- `pages.sort_order` + manual page reorder (currently title-sorted only).

## 9. Risks / notes

- Two new/changed DB objects (`notebooks` table, `pages.notebook_id`) — both applied
  manually in the Supabase SQL editor, SCHEMA.md updated in the same commit, no
  migrations-via-Claude-Code (CLAUDE.md).
- Resetting `pages` is intentionally destructive and acceptable for this scope. Confirm
  the target environment before applying the schema so a future environment with data is
  not mistaken for the disposable single-user development database.
- If the notebook-delete story lands as a route handler, that's new server-side surface
  (3rd handler); it must build the `service_role` client inline and never be imported into
  client code (D-001 / D-009).
- No rich text in the editor is a hard constraint on link UX — links are their own block,
  not inline spans. Setting expectations: this won't feel exactly like OneNote's inline
  "Link to page" on selected text.
