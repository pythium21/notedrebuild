'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';

const NAV_ITEMS = [
  { href: '/tasks', label: 'Tasks', icon: '✓' },
  { href: '/projects', label: 'Projects', icon: '▤' },
  { href: '/saves', label: 'Saves', icon: '🔖' },
];

function isActive(pathname: string, href: string) {
  return pathname === href || (href === '/tasks' && pathname === '/');
}

export function NavShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

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
