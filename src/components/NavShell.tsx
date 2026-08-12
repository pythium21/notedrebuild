'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useDrawer } from '@/components/DrawerContext';
import { supabase } from '@/lib/supabaseClient';

const NAV_ITEMS = [
  { href: '/', label: 'Today', icon: '☀' },
  { href: '/tasks', label: 'Tasks', icon: '✓' },
  { href: '/recurring', label: 'Recurring', icon: '↻' },
  { href: '/projects', label: 'Projects', icon: '▤' },
  { href: '/saves', label: 'Saves', icon: '🔖' },
  { href: '/pages', label: 'Notes', icon: '📝' },
];

function isActive(pathname: string, href: string) {
  return pathname === href || (href !== '/' && pathname.startsWith(`${href}/`));
}

export function NavShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { drawerContent, isOpen, openDrawer, closeDrawer } = useDrawer();
  const activeItem = NAV_ITEMS.find((item) => isActive(pathname, item.href));

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="sidebar__title">My OS</div>
        <nav className="sidebar__nav">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`sidebar__link${isActive(pathname, item.href) ? ' is-active' : ''}`}
            >
              <span aria-hidden>{item.icon}</span> {item.label}
            </Link>
          ))}
        </nav>
        <button type="button" className="sidebar__signout" onClick={() => supabase.auth.signOut()}>
          Sign out
        </button>
      </aside>

      <div className="mobile-topbar">
        <button type="button" className="mobile-hamburger" onClick={openDrawer} aria-label="Open menu">
          ☰
        </button>
        <span className="mobile-topbar__title">{activeItem?.label || 'My OS'}</span>
      </div>

      {isOpen && <div className="mobile-drawer-overlay" onClick={closeDrawer} />}

      <nav className={`mobile-drawer${isOpen ? ' is-open' : ''}`}>
        <div className="mobile-drawer__header">
          <span className="mobile-drawer__title">{activeItem?.label || 'My OS'}</span>
          <button type="button" className="mobile-drawer__close" onClick={closeDrawer} aria-label="Close">
            ×
          </button>
        </div>
        <div className="mobile-drawer__body">
          {drawerContent || <p className="list-empty">Nothing here yet.</p>}
        </div>
      </nav>

      <main className="main">{children}</main>

      <nav className="bottom-nav" aria-label="Primary">
        {NAV_ITEMS.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={`bottom-nav__link${isActive(pathname, item.href) ? ' is-active' : ''}`}
          >
            <span aria-hidden>{item.icon}</span>
            <span>{item.label}</span>
          </Link>
        ))}
      </nav>
    </div>
  );
}
