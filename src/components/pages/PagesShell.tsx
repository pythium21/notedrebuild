'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useDrawer, usePageDrawerContent } from '@/components/DrawerContext';
import { createPage, listPages, type Page } from '@/lib/pages';
import { PageEditor } from './PageEditor';

function PageTreeNode({
  page,
  pages,
  activeId,
  depth,
  onNavigate,
}: {
  page: Page;
  pages: Page[];
  activeId: string | null;
  depth: number;
  onNavigate: () => void;
}) {
  const children = pages.filter((p) => p.parent_id === page.id);
  return (
    <div className="pages-tree-node">
      <Link
        href={`/pages/${page.id}`}
        className={`pages-tree-node__link${activeId === page.id ? ' is-active' : ''}`}
        style={{ paddingLeft: `${0.5 + depth * 1}rem` }}
        onClick={onNavigate}
      >
        {page.emoji ? `${page.emoji} ` : '📄 '}
        {page.title}
      </Link>
      {children.length > 0 && (
        <div className="pages-tree-children">
          {children.map((child) => (
            <PageTreeNode key={child.id} page={child} pages={pages} activeId={activeId} depth={depth + 1} onNavigate={onNavigate} />
          ))}
        </div>
      )}
    </div>
  );
}

export function PagesShell({ pageId }: { pageId: string | null }) {
  const router = useRouter();
  const { closeDrawer } = useDrawer();
  const [pages, setPages] = useState<Page[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  useEffect(() => {
    listPages()
      .then(setPages)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  function handlePageCreated(page: Page) {
    setPages((prev) => [...prev, page]);
  }

  function handlePageUpdated(page: Page) {
    setPages((prev) => prev.map((p) => (p.id === page.id ? page : p)));
  }

  function handlePageDeleted(id: string) {
    setPages((prev) => prev.filter((p) => p.id !== id));
  }

  async function handleNewRootPage(onNavigate: () => void) {
    if (isCreating) return;
    setIsCreating(true);
    setError(null);
    try {
      const page = await createPage({ title: 'Untitled' });
      setPages((prev) => [...prev, page]);
      onNavigate();
      router.push(`/pages/${page.id}`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setIsCreating(false);
    }
  }

  const rootPages = pages.filter((p) => !p.parent_id);

  function renderTree(onNavigate: () => void) {
    return (
      <>
        <div className="pages-tree">
          {loading ? null : rootPages.length === 0 ? (
            <p className="list-empty">No pages yet.</p>
          ) : (
            rootPages.map((page) => (
              <PageTreeNode
                key={page.id}
                page={page}
                pages={pages}
                activeId={pageId}
                depth={0}
                onNavigate={onNavigate}
              />
            ))
          )}
        </div>
        <button type="button" className="pages-nav__new" onClick={() => handleNewRootPage(onNavigate)} disabled={isCreating}>
          {isCreating ? 'Creating…' : '+ New page'}
        </button>
      </>
    );
  }

  usePageDrawerContent(renderTree(closeDrawer));

  return (
    <div className="pages-shell">
      <nav className="pages-nav">
        <div className="pages-nav__header">
          <span className="pages-nav__title">Notes</span>
        </div>
        {renderTree(() => {})}
      </nav>

      <div className="pages-main">
        {error && <p className="auth-error">{error}</p>}
        {pageId ? (
          <PageEditor
            pageId={pageId}
            allPages={pages}
            onPageCreated={handlePageCreated}
            onPageUpdated={handlePageUpdated}
            onPageDeleted={handlePageDeleted}
          />
        ) : (
          <div className="pages-empty-state">
            <p className="list-empty">Select a page, or create a new one.</p>
            <button type="button" className="add-form__submit" onClick={() => handleNewRootPage(() => {})} disabled={isCreating}>
              {isCreating ? 'Creating…' : '+ New page'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
