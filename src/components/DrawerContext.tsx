'use client';

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

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

  return (
    <DrawerContext.Provider
      value={{
        drawerContent,
        setDrawerContent,
        isOpen,
        openDrawer: () => setIsOpen(true),
        closeDrawer: () => setIsOpen(false),
      }}
    >
      {children}
    </DrawerContext.Provider>
  );
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
export function usePageDrawerContent(content: ReactNode | null) {
  const { setDrawerContent } = useDrawerContext();
  useEffect(() => {
    setDrawerContent(content);
    return () => setDrawerContent(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [content]);
}
