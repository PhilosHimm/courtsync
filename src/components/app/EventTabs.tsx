'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

/** The event's sections. Current one marked with aria-current, not colour alone. */
export function EventTabs({ items }: { items: ReadonlyArray<{ href: string; label: string }> }) {
  const pathname = usePathname();
  const current = [...items]
    .sort((a, b) => b.href.length - a.href.length)
    .find((item) => pathname === item.href || pathname.startsWith(`${item.href}/`))?.href;
  return (
    <nav aria-label="Event sections" className="-mx-1 overflow-x-auto">
      <ul className="flex min-w-max gap-1 px-1 pb-1">
        {items.map((item) => {
          const active = item.href === current;
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={`block rounded-full px-4 py-2 text-caption ${active ? 'bg-ink text-on-dark' : 'text-ink hover:bg-canvas'}`}
              >
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
