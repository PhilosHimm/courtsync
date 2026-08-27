'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const NAV = [
  { href: '/', label: 'Home' },
  { href: '/tournaments', label: 'Tournaments' },
  { href: '/leagues', label: 'Leagues' },
  { href: '/dropins', label: 'Drop-ins' },
] as const;

export function SiteHeader() {
  const pathname = usePathname();

  return (
    <header className="border-b border-rule">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-6 px-6 py-4">
        <Link href="/" className="font-display text-xl font-bold uppercase tracking-tight text-ink">
          Court<span className="text-amber">Sync</span>
        </Link>
        <nav className="flex items-center gap-1">
          {NAV.map((item) => {
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={
                  active
                    ? 'rounded-sm px-3 py-1.5 font-mono text-xs uppercase tracking-wide text-amber'
                    : 'rounded-sm px-3 py-1.5 font-mono text-xs uppercase tracking-wide text-ink-dim transition-colors hover:text-ink'
                }
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
