'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ButtonLink } from './Button';

/**
 * Two rows, as the system specifies: a slim black global bar that never
 * changes, and a frosted sub-nav beneath it that names the surface you are on
 * and carries a persistent right-aligned action.
 *
 * The global bar is the only place pure black appears.
 *
 * Apple's sub-nav CTA is always the commercial action — "Buy". There is
 * nothing to buy here, so the persistent action is the one the product
 * exists for: your events. It goes to /events, which asks you to sign in if
 * you are not — the header itself never looks up a session, so every page
 * that does not need one stays static and needs no secret to build.
 */

const NAV = [
  { href: '/tournaments', label: 'Tournaments' },
  { href: '/leagues', label: 'Leagues' },
  { href: '/dropins', label: 'Drop-ins' },
  { href: '/e', label: 'Events' },
  { href: '/demo', label: 'Demo' },
] as const;

const AREA_NAMES: Record<string, string> = {
  '/': 'CourtSync',
  '/tournaments': 'Tournaments',
  '/leagues': 'Leagues',
  '/dropins': 'Drop-ins',
  '/demo': 'Demo',
  '/demo/tournament': 'Tournament demo',
  '/demo/league': 'League demo',
  '/demo/dropins': 'Drop-in demo',
  '/e': 'Events',
  '/events': 'Your events',
  '/me': 'Your schedule',
};

const REPO = 'https://github.com/PhilosHimm/courtsync';

export function SiteHeader() {
  const pathname = usePathname();
  const area =
    AREA_NAMES[pathname] ??
    (pathname.startsWith('/events/')
      ? 'Your events'
      : pathname.startsWith('/e/')
        ? 'Events'
        : 'CourtSync');

  return (
    <>
      {/*
        First focusable thing on every page. A keyboard user is otherwise five
        tab stops from the content, on every navigation — and the drop-in host
        this product is for is one-handed on a phone. Visually hidden until
        focused, then it appears as an ordinary primary action.
      */}
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-full focus:bg-primary focus:px-[22px] focus:py-[11px] focus:text-body focus:text-on-dark"
      >
        Skip to main content
      </a>

      {/* Global nav — 44px, true black, quiet 12px links. */}
      <header className="bg-void text-on-dark">
        <div className="mx-auto flex h-11 max-w-[1024px] items-center justify-between gap-5 px-6">
          <Link href="/" className="text-nav-link">
            CourtSync
          </Link>
          {/*
            Named, because a screen reader announces every nav landmark as
            "navigation" and an unnamed one is indistinguishable from the next.
          */}
          <nav aria-label="Primary" className="flex items-center gap-5">
            {NAV.map((item) => {
              // The demo has sub-pages, so an exact match would unlight the
              // nav the moment you opened one.
              const current = pathname === item.href || pathname.startsWith(`${item.href}/`);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  // Which page you are on is status, and PRODUCT.md commits to
                  // status never being carried by colour alone. The lighter
                  // grey says nothing to a screen reader, or to anyone who
                  // cannot separate the two greys.
                  aria-current={current ? 'page' : undefined}
                  className={
                    current ? 'text-nav-link text-on-dark' : 'text-nav-link text-body-muted'
                  }
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>
      </header>

      {/* Sub-nav — 52px, parchment at 80% over a backdrop blur. */}
      <div className="sticky top-0 z-10 border-b border-hairline bg-parchment/80 backdrop-blur-xl backdrop-saturate-150">
        <div className="mx-auto flex h-[52px] max-w-[1024px] items-center justify-between gap-6 px-6">
          <span className="text-tagline text-ink">{area}</span>
          <div className="flex items-center gap-5">
            <a href={REPO} className="hidden text-caption text-primary sm:inline">
              Source
            </a>
            <Link href="/me" className="text-caption text-primary">
              My schedule
            </Link>
            <ButtonLink href="/events" variant="primary" className="!px-4 !py-1.5 !text-caption">
              Your events
            </ButtonLink>
          </div>
        </div>
      </div>
    </>
  );
}
