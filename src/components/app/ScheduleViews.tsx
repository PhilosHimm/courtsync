import Link from 'next/link';
import type { Court, Timeslot } from '@/lib/core';
import { instantToWallClock, venueClockLabel } from '@/lib/core';
import type { ScheduleRow } from '@/lib/event/views';
import { courtTimeline } from '@/lib/event/views';
import { StatusText } from './ui';

/**
 * The schedule, as a list and as the court × time grid. Shared by the
 * organizer's board and the public page, so both read the same way.
 * Times are the venue's clock; order is by instant (C4).
 */

const time = (instant: string | null, zone: string) =>
  instant ? venueClockLabel(instant, zone) : 'Not placed';

/** The accessible baseline: a real table, works at every width. */
export function MatchList({
  rows,
  zone,
  hrefFor,
  showDay,
}: {
  rows: readonly ScheduleRow[];
  zone: string;
  hrefFor?: (row: ScheduleRow) => string;
  showDay?: boolean;
}) {
  if (rows.length === 0) return <p className="text-body text-ink-muted-80">No matches match.</p>;
  return (
    <div className="overflow-x-auto rounded-lg border border-hairline">
      <table className="w-full min-w-[36rem] text-left text-caption">
        <caption className="sr-only">Matches, in time order</caption>
        <thead className="bg-parchment">
          <tr>
            {showDay && (
              <th scope="col" className="px-3 py-2">
                Day
              </th>
            )}
            <th scope="col" className="px-3 py-2">
              Time
            </th>
            <th scope="col" className="px-3 py-2">
              Court
            </th>
            <th scope="col" className="px-3 py-2">
              Match
            </th>
            <th scope="col" className="px-3 py-2">
              Score
            </th>
            <th scope="col" className="px-3 py-2">
              Status
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.matchId} className="border-t border-hairline align-top">
              {showDay && (
                <td className="px-3 py-2">
                  {row.startAt ? instantToWallClock(row.startAt, zone).date : '—'}
                </td>
              )}
              <td className="whitespace-nowrap px-3 py-2">{time(row.startAt, zone)}</td>
              <td className="px-3 py-2">{row.court ?? '—'}</td>
              <td className="px-3 py-2">
                {hrefFor ? (
                  <Link href={hrefFor(row)} className="text-primary">
                    {row.home} v {row.away}
                  </Link>
                ) : (
                  <span>
                    {row.home} v {row.away}
                  </span>
                )}
                {(row.roundLabel || row.referee) && (
                  <span className="block text-ink-muted-80">
                    {[
                      row.bracket
                        ? `${row.bracket} ${row.roundLabel}`
                        : row.roundLabel === 'pool'
                          ? null
                          : row.roundLabel,
                      row.referee ? `Ref: ${row.referee}` : null,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </span>
                )}
              </td>
              <td className="whitespace-nowrap px-3 py-2">{row.score ?? '—'}</td>
              <td className="px-3 py-2">
                <StatusText status={row.status} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * The court × time grid — the one artifact this product actually makes, and
 * the only element allowed the system shadow. Scrolls sideways inside itself
 * on a phone rather than making the page scroll.
 */
export function Timeline({
  rows,
  timeslots,
  courts,
  zone,
  hrefFor,
  selected,
}: {
  rows: readonly ScheduleRow[];
  timeslots: readonly Timeslot[];
  courts: readonly Court[];
  zone: string;
  hrefFor?: (row: ScheduleRow) => string;
  selected?: string;
}) {
  const grid = courtTimeline({ rows, timeslots, courts });
  return (
    <div className="flex flex-col gap-3">
      <div className="overflow-x-auto rounded-lg bg-canvas shadow-product">
        <table className="w-full border-collapse text-caption">
          <caption className="sr-only">
            Court timeline: one row per time slot, one column per court
          </caption>
          <thead>
            <tr className="bg-parchment">
              <th scope="col" className="sticky left-0 bg-parchment px-3 py-2 text-left">
                Time
              </th>
              {grid.courts.map((court) => (
                <th key={court.id} scope="col" className="min-w-[10rem] px-3 py-2 text-left">
                  {court.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {grid.slots.map((slot) => (
              <tr key={slot.timeslotId} className="border-t border-hairline align-top">
                <th
                  scope="row"
                  className="sticky left-0 whitespace-nowrap bg-canvas px-3 py-2 text-left font-normal"
                >
                  {venueClockLabel(slot.startAt, zone)}
                </th>
                {slot.cells.map((cell, i) => (
                  <td key={grid.courts[i]?.id ?? i} className="px-2 py-1.5">
                    {cell ? (
                      <Cell
                        row={cell}
                        href={hrefFor?.(cell)}
                        selected={cell.matchId === selected}
                      />
                    ) : (
                      <span className="sr-only">Free</span>
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {(grid.unplaced.length > 0 || grid.collisions.length > 0) && (
        <div className="rounded-lg border border-hairline p-4">
          {grid.collisions.length > 0 && (
            <p className="text-caption-strong">
              Sharing a cell with another match: {grid.collisions.length}
            </p>
          )}
          {grid.unplaced.length > 0 && (
            <p className="text-caption-strong">Not on the grid yet: {grid.unplaced.length}</p>
          )}
          <ul className="mt-2 flex flex-col gap-1">
            {[...grid.collisions, ...grid.unplaced].map((row) => (
              <li key={row.matchId}>
                <Cell row={row} href={hrefFor?.(row)} selected={row.matchId === selected} />
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function Cell({
  row,
  href,
  selected,
}: {
  row: ScheduleRow;
  href?: string | undefined;
  selected: boolean;
}) {
  const body = (
    <>
      <span className="block text-caption-strong">
        {row.home} <span className="font-normal">v</span> {row.away}
      </span>
      <span className="flex flex-wrap items-center gap-x-2 text-ink-muted-80">
        <StatusText status={row.status} />
        {row.score && <span>{row.score}</span>}
        {row.referee && <span>Ref: {row.referee}</span>}
      </span>
    </>
  );
  const box = `block rounded-sm border px-2 py-1.5 ${selected ? 'border-primary bg-pearl' : 'border-hairline'}`;
  return href ? (
    <Link href={href} className={box} aria-current={selected ? 'true' : undefined} scroll={false}>
      {body}
    </Link>
  ) : (
    <div className={box}>{body}</div>
  );
}
