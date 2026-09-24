import Link from 'next/link';
import type { MatchStatus } from '@/lib/core';
import { STATUS_LABELS } from '@/lib/event/views';

/**
 * Server-renderable pieces of the signed-in app. Same grammar as the rest of
 * the site: parchment and hairlines for chrome, the blue pill for the one
 * real action on a screen, and never a status carried by colour alone.
 */

export function Field({
  id,
  label,
  hint,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-caption-strong text-ink">
        {label}
      </label>
      {children}
      {hint && (
        <p id={`${id}-hint`} className="text-caption text-ink-muted-80">
          {hint}
        </p>
      )}
    </div>
  );
}

export function PageHeading({
  title,
  lead,
  children,
}: {
  title: string;
  lead?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-display-md text-ink">{title}</h1>
        {lead && <p className="mt-1 max-w-2xl text-body text-ink-muted-80">{lead}</p>}
      </div>
      {children && <div className="flex flex-wrap items-center gap-3">{children}</div>}
    </div>
  );
}

export function SectionTitle({
  children,
  note,
}: {
  children: React.ReactNode;
  note?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
      <h2 className="text-tagline text-ink">{children}</h2>
      {note && <p className="text-caption text-ink-muted-80">{note}</p>}
    </div>
  );
}

/** Something the engine or the data layer reported. Stated, never hidden. */
export function Notice({
  children,
  tone = 'info',
}: {
  children: React.ReactNode;
  tone?: 'info' | 'warning';
}) {
  return (
    <div
      className={`rounded-sm border px-4 py-3 text-caption text-ink ${
        tone === 'warning' ? 'border-ink bg-canvas' : 'border-hairline bg-parchment'
      }`}
    >
      {tone === 'warning' && <span className="text-caption-strong">Check this: </span>}
      {children}
    </div>
  );
}

/** A card: the utility surface, at the 18px radius. */
export function Card({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-lg border border-hairline bg-canvas p-5 ${className ?? ''}`}>
      {children}
    </div>
  );
}

const STATUS_MARK: Record<MatchStatus, string> = {
  scheduled: '○',
  live: '●',
  final: '✓',
  forfeit: '–',
  delayed: '!',
  cancelled: '×',
};

/** A match status as a symbol AND words. Colour is never the only signal. */
export function StatusText({ status }: { status: MatchStatus }) {
  return (
    <span className="inline-flex items-center gap-1 whitespace-nowrap text-caption text-ink-muted-80">
      <span aria-hidden="true">{STATUS_MARK[status]}</span>
      {STATUS_LABELS[status]}
    </span>
  );
}

export function EmptyState({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed border-hairline bg-pearl px-6 py-10 text-center">
      <p className="text-body-strong text-ink">{title}</p>
      {children && <div className="mt-2 text-caption text-ink-muted-80">{children}</div>}
    </div>
  );
}

/** Tabs across an event's pages. The current one is marked for assistive tech, not just drawn darker. */
export function TabNav({
  label,
  items,
  current,
}: {
  label: string;
  items: ReadonlyArray<{ href: string; label: string }>;
  current: string;
}) {
  return (
    <nav aria-label={label} className="-mx-1 overflow-x-auto">
      <ul className="flex min-w-max gap-1 px-1">
        {items.map((item) => {
          const active = current === item.href;
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={`block rounded-full px-4 py-2 text-caption ${
                  active ? 'bg-ink text-on-dark' : 'text-ink hover:bg-parchment'
                }`}
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
