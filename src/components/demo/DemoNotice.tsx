import { DEMO_NOTICE } from '@/lib/demo';

/**
 * The label that has to be on every demo screen.
 *
 * PRODUCT.md: there are no real rosters, results, standings or attendance
 * records, all demo data is invented, and nothing in this project may present
 * invented data as real. A demo that runs the actual engine is exactly where
 * that stops being obvious — the schedule below is genuinely computed, the
 * standings are genuinely correct, and somebody skimming could reasonably
 * take the teams in them for teams. Hence a notice on the page rather than a
 * line in a footer.
 *
 * Set on parchment with a single hairline: chrome, not an alert. This is a
 * standing fact about the page, not a warning that something went wrong.
 */
export function DemoNotice() {
  return (
    <p className="rounded-sm border border-hairline bg-parchment px-4 py-3 text-caption text-ink-muted-80">
      {DEMO_NOTICE}
    </p>
  );
}

/** A section heading inside a demo board. */
export function BoardHeading({
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

/** Something the engine reported it could not do. Stated, never hidden. */
export function Shortfall({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-sm border border-hairline bg-parchment px-4 py-3 text-caption text-ink">
      {children}
    </p>
  );
}
