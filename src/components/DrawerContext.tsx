'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

interface DrawerContextValue {
  setDrawerContent: (content: ReactNode | null) => void;
  drawerContent: ReactNode | null;
  isOpen: boolean;
  openDrawer: () => void;
  closeDrawer: () => void;
}

const DrawerContext = createContext<DrawerContextValue | null>(null);

export function DrawerProvider({ children }: { children: ReactNode }) {
  const [drawerContent, setDrawerContent] = useState<ReactNode | null>(null);
  const [isOpen, setIsOpen] = useState(false);

  // These identities MUST stay stable across renders: pages memoize the
  // content they inject via usePageDrawerContent, and closeDrawer is a
  // dependency of those memos. Inline arrows here would bust the memo every
  // time drawerContent changes, re-triggering the injection effect — an
  // infinite update loop that froze the whole Notes route. See MISTAKES.md.
  const openDrawer = useCallback(() => setIsOpen(true), []);
  const closeDrawer = useCallback(() => setIsOpen(false), []);

  const value = useMemo(
    () => ({ drawerContent, setDrawerContent, isOpen, openDrawer, closeDrawer }),
    [drawerContent, isOpen, openDrawer, closeDrawer]
  );

  return <DrawerContext.Provider value={value}>{children}</DrawerContext.Provider>;
}

function useDrawerContext() {
  const ctx = useContext(DrawerContext);
  if (!ctx) throw new Error('useDrawerContext must be used within a DrawerProvider');
  return ctx;
}

export function useDrawer() {
  return useDrawerContext();
}

// Lets a page (e.g. Notes) supply custom drawer content for as long as it's mounted.
// Automatically clears back to null on unmount so other pages get the default empty drawer.
// CONTRACT: callers must pass a memoized node (useMemo) — a fresh JSX node every
// render makes this effect re-fire every render, and because setting content
// re-renders all drawer consumers (including the caller), that's an infinite loop.
export function usePageDrawerContent(content: ReactNode | null) {
  const { setDrawerContent } = useDrawerContext();
  useEffect(() => {
    setDrawerContent(content);
    return () => setDrawerContent(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [content]);
}
