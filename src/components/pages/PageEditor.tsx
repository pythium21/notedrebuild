'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import {
  createSubPage,
  deletePage,
  emptyTextBlock,
  getPage,
  newBlockId,
  updatePage,
  type Block,
  type Page,
} from '@/lib/pages';
import { BlockMenu, type BlockOptionType } from './BlockMenu';

const SAVE_DEBOUNCE_MS = 800;

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
  const [creatingSubPage, setCreatingSubPage] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const titleRef = useRef('');
  const emojiRef = useRef('');
  const blocksRef = useRef<Block[]>([]);
  const dirtyRef = useRef(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const editorRef = useRef<HTMLDivElement>(null);

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

  async function handleMenuSelect(type: BlockOptionType) {
    if (!menu) return;
    const { blockId, mode } = menu;

    if (type === 'sub-page') {
      await handleCreateSubPage(blockId, mode);
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

  const parent = page.parent_id ? allPages.find((p) => p.id === page.parent_id) : null;

  return (
    <div className="page-editor" ref={editorRef}>
      {parent && (
        <Link href={`/pages/${parent.id}`} className="page-editor__parent-link">
          ← {parent.emoji ? `${parent.emoji} ` : ''}
          {parent.title}
        </Link>
      )}

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
                className="block block--text"
                rows={1}
                value={block.text || ''}
                placeholder="Type '/' for commands"
                onChange={(e) => handleBlockTextChange(block.id, e.target.value)}
              />
            )}
            {block.type === 'heading' && (
              <input
                type="text"
                className="block block--heading"
                value={block.text || ''}
                placeholder="Heading"
                onChange={(e) => handleBlockTextChange(block.id, e.target.value)}
              />
            )}
            {block.type === 'checklist' && (
              <label className="block block--checklist">
                <input type="checkbox" checked={!!block.checked} onChange={() => handleToggleChecked(block.id)} />
                <input
                  type="text"
                  value={block.text || ''}
                  placeholder="To-do"
                  onChange={(e) => handleBlockTextChange(block.id, e.target.value)}
                />
              </label>
            )}
            {block.type === 'bullet' && (
              <div className="block block--bullet">
                <span className="block__bullet-dot" aria-hidden>
                  •
                </span>
                <input
                  type="text"
                  value={block.text || ''}
                  placeholder="List item"
                  onChange={(e) => handleBlockTextChange(block.id, e.target.value)}
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
    </div>
  );
}
