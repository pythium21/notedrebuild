'use client';

import type { ReactNode } from 'react';

// Desktop: positioned dropdown anchored under the trigger (parent must be
// position:relative). Mobile (<768px): bottom sheet — see .breadcrumb-menu
// media query in globals.css, mirroring BlockMenu's pattern.
export function BreadcrumbMenu({ onClose, children }: { onClose: () => void; children: ReactNode }) {
  return (
    <>
      <div className="breadcrumb-menu-scrim" onClick={onClose} />
      <div className="breadcrumb-menu">{children}</div>
    </>
  );
}
