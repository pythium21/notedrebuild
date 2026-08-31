'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import {
  createPage,
  createSubPage,
  deletePage,
  emptyTextBlock,
  getPage,
  newBlockId,
  updatePage,
  type Block,
  type Page,
} from '@/lib/pages';
import { BreadcrumbMenu } from '@/components/BreadcrumbMenu';
import { Picker } from '@/components/Picker';
import { BlockMenu, type BlockOptionType } from './BlockMenu';

const SAVE_DEBOUNCE_MS = 800;

// Walks parent_id from `page` up to the root, root-first, excluding `page`
// itself. `allPages` is the full flat list for the signed-in user (already
// RLS-scoped), so no extra fetch is needed to build the trail.
function getAncestors(page: Page, allPages: Page[]): Page[] {
  const chain: Page[] = [];
  const seen = new Set<string>([page.id]);
  let parentId = page.parent_id;
  while (parentId && !seen.has(parentId)) {
    const parent = allPages.find((p) => p.id === parentId);
    if (!parent) break;
    seen.add(parent.id);
    chain.unshift(parent);
    parentId = parent.parent_id;
  }
  return chain;
}

export function PageEditor({
  pageId,
  allPages,
  onPageCreated,
  onPageUpdated,
  onPageDeleted,
}: {
  pageId: string;
  allPages: Page[];
  onPageCreated: (page: Page) => void;
  onPageUpdated: (page: Page) => void;
  onPageDeleted: (id: string) => void;
}) {
  const router = useRouter();

  const [page, setPage] = useState<Page | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [emoji, setEmoji] = useState('');
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [menu, setMenu] = useState<{ blockId: string; mode: 'convert' | 'insert-after' } | null>(null);
  const [linkPickerAnchor, setLinkPickerAnchor] = useState<{ blockId: string; mode: 'convert' | 'insert-after' } | null>(
    null,
  );
  const [creatingSubPage, setCreatingSubPage] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [breadcrumbOpen, setBreadcrumbOpen] = useState(false);
  const [creatingSibling, setCreatingSibling] = useState(false);

  const titleRef = useRef('');
  const emojiRef = useRef('');
  const blocksRef = useRef<Block[]>([]);
  const dirtyRef = useRef(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const editorRef = useRef<HTMLDivElement>(null);
  const blockInputRefs = useRef<Map<string, HTMLInputElement | HTMLTextAreaElement>>(new Map());
  const pendingFocusRef = useRef<{ id: string; cursor: 'start' | 'end' } | null>(null);

  function registerBlockRef(id: string, el: HTMLInputElement | HTMLTextAreaElement | null) {
    if (el) blockInputRefs.current.set(id, el);
    else blockInputRefs.current.delete(id);
  }

  function focusBlock(id: string, cursor: 'start' | 'end') {
    pendingFocusRef.current = { id, cursor };
  }

  async function performSave(): Promise<void> {
    if (!dirtyRef.current) return;
    dirtyRef.current = false;
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    setSaveState('saving');
    try {
      const updated = await updatePage(pageId, {
        title: titleRef.current.trim() || 'Untitled',
        emoji: emojiRef.current || null,
        content: blocksRef.current,
      });
      setSaveState('saved');
      onPageUpdated(updated);
    } catch (e) {
      setSaveState('error');
      setError((e as Error).message);
    }
  }

  function scheduleSave() {
    dirtyRef.current = true;
    setSaveState('idle');
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      void performSave();
    }, SAVE_DEBOUNCE_MS);
  }

  // Flushes any pending debounced save — must be awaited (not just fired)
  // before a sub-page write touches this page's content, or a race can
  // silently drop the in-flight edit. See DECISIONS.md D-012.
  async function flush(): Promise<void> {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    await performSave();
  }

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setBreadcrumbOpen(false);
    getPage(pageId)
      .then((p) => {
        if (cancelled) return;
        setPage(p);
        setTitle(p.title);
        titleRef.current = p.title;
        setEmoji(p.emoji || '');
        emojiRef.current = p.emoji || '';
        const initialBlocks = p.content.length > 0 ? p.content : [emptyTextBlock()];
        setBlocks(initialBlocks);
        blocksRef.current = initialBlocks;
        dirtyRef.current = false;
        setSaveState('idle');
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));

    return () => {
      cancelled = true;
      void flush();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageId]);

  useEffect(() => {
    const textareas = editorRef.current?.querySelectorAll<HTMLTextAreaElement>('textarea.block--text');
    textareas?.forEach((ta) => {
      ta.style.height = 'auto';
      ta.style.height = `${ta.scrollHeight}px`;
    });
  }, [blocks]);

  useEffect(() => {
    const pending = pendingFocusRef.current;
    if (!pending) return;
    const el = blockInputRefs.current.get(pending.id);
    if (!el) return;
    pendingFocusRef.current = null;
    el.focus();
    const pos = pending.cursor === 'start' ? 0 : el.value.length;
    try {
      el.setSelectionRange(pos, pos);
    } catch {
      // some input types don't support selection; ignore if not
    }
  }, [blocks]);

  function handleTitleChange(value: string) {
    setTitle(value);
    titleRef.current = value;
    scheduleSave();
  }

  function handleEmojiChange(value: string) {
    setEmoji(value);
    emojiRef.current = value;
    scheduleSave();
  }

  function commitBlocks(newBlocks: Block[]) {
    setBlocks(newBlocks);
    blocksRef.current = newBlocks;
    scheduleSave();
  }

  function handleBlockTextChange(id: string, value: string) {
    commitBlocks(blocks.map((b) => (b.id === id ? { ...b, text: value } : b)));
    if (value.startsWith('/')) {
      setMenu({ blockId: id, mode: 'convert' });
    } else if (menu?.blockId === id && menu.mode === 'convert') {
      setMenu(null);
    }
  }

  function handleToggleChecked(id: string) {
    commitBlocks(blocks.map((b) => (b.id === id ? { ...b, checked: !b.checked } : b)));
  }

  function handleDeleteBlock(id: string) {
    const filtered = blocks.filter((b) => b.id !== id);
    commitBlocks(filtered.length > 0 ? filtered : [emptyTextBlock()]);
  }

  function handleBlockKeyDown(e: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>, block: Block) {
    // Let the "/" turn-into menu own the keyboard while it's open for this block.
    if (menu?.blockId === block.id) return;

    if (e.key === 'Enter') {
      // Text blocks are multi-line — Shift+Enter inserts a soft line break instead
      // of creating a new block. Other block types are single-line, so plain
      // Enter always creates a new block.
      if (block.type === 'text' && e.shiftKey) return;
      e.preventDefault();

      const idx = blocks.findIndex((b) => b.id === block.id);
      const fresh: Block = emptyTextBlock();
      commitBlocks([...blocks.slice(0, idx + 1), fresh, ...blocks.slice(idx + 1)]);
      focusBlock(fresh.id, 'start');
      return;
    }

    if (e.key === 'Backspace') {
      const el = e.currentTarget;
      const isEmpty = !block.text;
      const atStart = el.selectionStart === 0 && el.selectionEnd === 0;
      if (!isEmpty || !atStart) return;
      if (blocks.length <= 1) return; // keep at least one block, matching handleDeleteBlock's floor

      e.preventDefault();
      const idx = blocks.findIndex((b) => b.id === block.id);
      const filtered = blocks.filter((b) => b.id !== block.id);
      commitBlocks(filtered);

      // Find the nearest focusable (non page_link) block, preferring the one
      // just before the deleted block, falling back to searching outward.
      const isFocusable = (b: Block | undefined) => b && b.type !== 'page_link';
      let target: Block | undefined;
      let cursor: 'start' | 'end' = 'end';
      for (let i = idx - 1; i >= 0; i--) {
        if (isFocusable(filtered[i])) { target = filtered[i]; cursor = 'end'; break; }
      }
      if (!target) {
        for (let i = idx; i < filtered.length; i++) {
          if (isFocusable(filtered[i])) { target = filtered[i]; cursor = 'start'; break; }
        }
      }
      if (target) focusBlock(target.id, cursor);
    }
  }

  async function handleMenuSelect(type: BlockOptionType) {
    if (!menu) return;
    const { blockId, mode } = menu;

    if (type === 'sub-page') {
      await handleCreateSubPage(blockId, mode);
      return;
    }

    if (type === 'link-page') {
      setLinkPickerAnchor({ blockId, mode });
      setMenu(null);
      return;
    }

    if (mode === 'convert') {
      commitBlocks(
        blocks.map((b) =>
          b.id === blockId ? { id: b.id, type, text: '', checked: type === 'checklist' ? false : undefined } : b
        )
      );
    } else {
      const idx = blocks.findIndex((b) => b.id === blockId);
      const fresh: Block = { id: newBlockId(), type, text: '', checked: type === 'checklist' ? false : undefined };
      commitBlocks([...blocks.slice(0, idx + 1), fresh, ...blocks.slice(idx + 1)]);
    }
    setMenu(null);
  }

  // Insert a page_link block pointing at an existing page (DECISIONS.md D-030
  // Phase 1) — unlike handleCreateSubPage, this writes no other row and creates
  // no new page, so it's a plain commitBlocks + scheduleSave with no D-012
  // flush-before-write ordering concern.
  function handleLinkPageSelect(target: Page) {
    if (!linkPickerAnchor) return;
    const { blockId, mode } = linkPickerAnchor;
    const linkBlock: Block = { id: newBlockId(), type: 'page_link', pageId: target.id };
    const newBlocks =
      mode === 'convert'
        ? blocks.map((b) => (b.id === blockId ? linkBlock : b))
        : (() => {
            const idx = blocks.findIndex((b) => b.id === blockId);
            return [...blocks.slice(0, idx + 1), linkBlock, ...blocks.slice(idx + 1)];
          })();
    commitBlocks(newBlocks);
    setLinkPickerAnchor(null);
  }

  async function handleCreateSubPage(anchorId: string, mode: 'convert' | 'insert-after') {
    setCreatingSubPage(true);
    setError(null);
    try {
      // Ordering matters: flush the parent's pending edit before this write,
      // or a fast sub-page creation can silently drop it. See DECISIONS.md D-012.
      await flush();

      const child = await createSubPage(pageId, 'Untitled');
      onPageCreated(child);

      const linkBlock: Block = { id: newBlockId(), type: 'page_link', pageId: child.id };
      const newBlocks =
        mode === 'convert'
          ? blocks.map((b) => (b.id === anchorId ? linkBlock : b))
          : (() => {
              const idx = blocks.findIndex((b) => b.id === anchorId);
              return [...blocks.slice(0, idx + 1), linkBlock, ...blocks.slice(idx + 1)];
            })();

      setBlocks(newBlocks);
      blocksRef.current = newBlocks;
      dirtyRef.current = false;
      const updated = await updatePage(pageId, { content: newBlocks });
      onPageUpdated(updated);

      router.push(`/pages/${child.id}`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setCreatingSubPage(false);
      setMenu(null);
    }
  }

  async function handleCreateSibling() {
    if (creatingSibling || !page) return;
    setCreatingSibling(true);
    setError(null);
    try {
      const sibling = await createPage({ title: 'Untitled', parent_id: page.parent_id });
      onPageCreated(sibling);
      setBreadcrumbOpen(false);
      router.push(`/pages/${sibling.id}`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setCreatingSibling(false);
    }
  }

  async function handleDeletePage() {
    if (deleting || !page) return;
    if (!window.confirm(`Delete "${page.title}"?`)) return;
    setDeleting(true);
    setError(null);
    try {
      await deletePage(pageId);
      onPageDeleted(pageId);
      router.push(page.parent_id ? `/pages/${page.parent_id}` : '/pages');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setDeleting(false);
    }
  }

  if (loading) return null;
  if (error && !page) return <p className="auth-error">{error}</p>;
  if (!page) return null;

  const ancestors = getAncestors(page, allPages);
  const siblings = allPages.filter((p) => p.parent_id === page.parent_id && p.id !== page.id);

  return (
    <div className="page-editor" ref={editorRef}>
      <button type="button" className="breadcrumb__back" onClick={() => router.back()}>
        ← Back
      </button>
      <nav className="breadcrumb">
        <Link href="/pages" className="breadcrumb__link">
          Notes
        </Link>
        {ancestors.map((ancestor) => (
          <span key={ancestor.id} className="breadcrumb__segment">
            <span className="breadcrumb__sep">/</span>
            <Link href={`/pages/${ancestor.id}`} className="breadcrumb__link">
              {ancestor.emoji ? `${ancestor.emoji} ` : ''}
              {ancestor.title}
            </Link>
          </span>
        ))}
        <span className="breadcrumb__segment breadcrumb__segment--current">
          <span className="breadcrumb__sep">/</span>
          <button type="button" className="breadcrumb__current" onClick={() => setBreadcrumbOpen((o) => !o)}>
            {emoji ? `${emoji} ` : ''}
            {title || 'Untitled'} ▾
          </button>
          {breadcrumbOpen && (
            <BreadcrumbMenu onClose={() => setBreadcrumbOpen(false)}>
              {siblings.length === 0 ? (
                <p className="breadcrumb-menu__empty">No other pages here.</p>
              ) : (
                siblings.map((sibling) => (
                  <Link
                    key={sibling.id}
                    href={`/pages/${sibling.id}`}
                    className="breadcrumb-menu__item"
                    onClick={() => setBreadcrumbOpen(false)}
                  >
                    {sibling.emoji ? `${sibling.emoji} ` : '📄 '}
                    {sibling.title}
                  </Link>
                ))
              )}
              <button
                type="button"
                className="breadcrumb-menu__item breadcrumb-menu__item--action"
                onClick={handleCreateSibling}
                disabled={creatingSibling}
              >
                {creatingSibling ? 'Creating…' : '+ New page'}
              </button>
            </BreadcrumbMenu>
          )}
        </span>
      </nav>

      {error && <p className="auth-error">{error}</p>}

      <div className="page-editor__header">
        <input
          type="text"
          className="page-editor__emoji"
          value={emoji}
          maxLength={4}
          placeholder="🙂"
          onChange={(e) => handleEmojiChange(e.target.value)}
        />
        <input
          type="text"
          className="page-editor__title"
          value={title}
          placeholder="Untitled"
          onChange={(e) => handleTitleChange(e.target.value)}
        />
      </div>

      <div className="page-editor__meta">
        <span className="page-editor__save-state">
          {saveState === 'saving' ? 'Saving…' : saveState === 'saved' ? 'Saved' : saveState === 'error' ? 'Save failed' : ''}
        </span>
        <button type="button" className="item__action item__action--danger" onClick={handleDeletePage} disabled={deleting}>
          {deleting ? 'Deleting…' : 'Delete page'}
        </button>
      </div>

      <div className="blocks">
        {blocks.map((block) => (
          <div key={block.id} className="block-row">
            {block.type === 'text' && (
              <textarea
                ref={(el) => registerBlockRef(block.id, el)}
                className="block block--text"
                rows={1}
                value={block.text || ''}
                placeholder="Type '/' for commands"
                onChange={(e) => handleBlockTextChange(block.id, e.target.value)}
                onKeyDown={(e) => handleBlockKeyDown(e, block)}
              />
            )}
            {block.type === 'heading' && (
              <input
                ref={(el) => registerBlockRef(block.id, el)}
                type="text"
                className="block block--heading"
                value={block.text || ''}
                placeholder="Heading"
                onChange={(e) => handleBlockTextChange(block.id, e.target.value)}
                onKeyDown={(e) => handleBlockKeyDown(e, block)}
              />
            )}
            {block.type === 'checklist' && (
              <label className="block block--checklist">
                <input type="checkbox" checked={!!block.checked} onChange={() => handleToggleChecked(block.id)} />
                <input
                  ref={(el) => registerBlockRef(block.id, el)}
                  type="text"
                  value={block.text || ''}
                  placeholder="To-do"
                  onChange={(e) => handleBlockTextChange(block.id, e.target.value)}
                  onKeyDown={(e) => handleBlockKeyDown(e, block)}
                />
              </label>
            )}
            {block.type === 'bullet' && (
              <div className="block block--bullet">
                <span className="block__bullet-dot" aria-hidden>
                  •
                </span>
                <input
                  ref={(el) => registerBlockRef(block.id, el)}
                  type="text"
                  value={block.text || ''}
                  placeholder="List item"
                  onChange={(e) => handleBlockTextChange(block.id, e.target.value)}
                  onKeyDown={(e) => handleBlockKeyDown(e, block)}
                />
              </div>
            )}
            {block.type === 'page_link' && (
              <Link href={`/pages/${block.pageId}`} className="block block--page-link">
                {(() => {
                  const linked = allPages.find((p) => p.id === block.pageId);
                  return `${linked?.emoji ? `${linked.emoji} ` : '📄 '}${linked?.title || 'Untitled'}`;
                })()}
              </Link>
            )}

            <div className="block-row__controls">
              <button
                type="button"
                className="block-row__btn"
                title="Add block below"
                onClick={() => setMenu({ blockId: block.id, mode: 'insert-after' })}
              >
                +
              </button>
              <button type="button" className="block-row__btn" title="Delete block" onClick={() => handleDeleteBlock(block.id)}>
                ×
              </button>
            </div>

            {menu?.blockId === block.id && (
              <BlockMenu onSelect={handleMenuSelect} onClose={() => setMenu(null)} busy={creatingSubPage} />
            )}
          </div>
        ))}
      </div>

      {linkPickerAnchor && (
        <Picker
          title="Link to page"
          items={allPages.filter((p) => p.id !== pageId)}
          getKey={(p) => p.id}
          getLabel={(p) => `${p.emoji ? `${p.emoji} ` : ''}${p.title}`}
          onSelect={handleLinkPageSelect}
          onClose={() => setLinkPickerAnchor(null)}
          emptyLabel="No other pages yet."
        />
      )}
    </div>
  );
}
