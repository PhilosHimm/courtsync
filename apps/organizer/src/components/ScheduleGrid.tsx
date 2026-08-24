import type { PersonaId } from '@/lib/personas';

/**
 * The signature visual, reused everywhere at a rhythm that matches the
 * persona: a dense one-day grid for the tournament organizer, a repeating
 * weekly strip for the league convener, a live rotating row for the drop-in
 * host. Each variant's structure is real information about that persona's
 * actual need (schedule generation vs. rescheduling vs. live rotation) —
 * see docs/DOMAIN.md for why Session and Timeslot are shaped this way.
 *
 * Decorative: courts, timeslots and rosters shown here are illustrative,
 * not real data. See PRODUCT.md's Evidence on Hand — nothing in this
 * product may present invented data as real, so this stays visibly
 * schematic rather than dressed up as a live board.
 */

const TOURNAMENT_FILLED = new Set([0, 1, 2, 4, 5, 7, 8, 9, 10, 12, 13, 14, 16, 17, 19, 20, 21, 22]);

function TournamentGrid({ compact }: { compact?: boolean }) {
  const courts = 4;
  const rows = 6;
  return (
    <div className="inline-flex flex-col gap-1">
      {!compact && (
        <div className="grid grid-cols-4 gap-1 pl-8">
          {Array.from({ length: courts }, (_, c) => (
            <span key={c} className="font-mono text-[10px] uppercase tracking-wider text-ink-faint">
              Ct {c + 1}
            </span>
          ))}
        </div>
      )}
      <div className="flex gap-1">
        {!compact && (
          <div className="flex flex-col justify-between py-0.5 pr-1 text-right">
            {['9:00', '10:40', '12:20'].map((t) => (
              <span key={t} className="font-mono text-[10px] text-ink-faint">
                {t}
              </span>
            ))}
          </div>
        )}
        <div className="grid grid-cols-4 grid-rows-6 gap-1">
          {Array.from({ length: courts * rows }, (_, i) => {
            const filled = TOURNAMENT_FILLED.has(i);
            return (
              <span
                key={i}
                className={
                  filled
                    ? 'h-4 w-4 rounded-[3px] bg-amber sm:h-5 sm:w-5'
                    : 'h-4 w-4 rounded-[3px] border border-dashed border-rule sm:h-5 sm:w-5'
                }
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}

function LeagueStrip() {
  const weeks = 8;
  const movedWeek = 5; // "week 6" — the reschedule this persona's story is about
  return (
    <div className="inline-flex flex-col gap-2">
      <div className="flex items-end gap-2">
        {Array.from({ length: weeks }, (_, w) => {
          const moved = w === movedWeek;
          return (
            <div key={w} className="flex flex-col items-center gap-1">
              <div
                className={
                  moved
                    ? 'grid grid-cols-2 grid-rows-3 gap-[3px] rounded-[3px] border border-dashed border-blue bg-blue-soft p-1'
                    : 'grid grid-cols-2 grid-rows-3 gap-[3px] rounded-[3px] bg-surface-2 p-1'
                }
              >
                {Array.from({ length: 6 }, (_, c) => (
                  <span
                    key={c}
                    className={
                      moved && c === 4
                        ? 'h-1.5 w-1.5 rounded-[2px] bg-blue'
                        : 'h-1.5 w-1.5 rounded-[2px] bg-amber'
                    }
                  />
                ))}
              </div>
              <span
                className={
                  moved
                    ? 'font-mono text-[9px] uppercase tracking-wide text-blue'
                    : 'font-mono text-[9px] text-ink-faint'
                }
              >
                {moved ? 'moved' : `wk ${w + 1}`}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function DropInBoard() {
  const waitlist = [
    { label: '9', state: 'in' },
    { label: '10', state: 'in' },
    { label: 'W1', state: 'wait' },
    { label: 'W2', state: 'wait' },
  ] as const;

  return (
    <div className="inline-flex flex-col gap-3">
      <div className="flex gap-3">
        {[1, 2].map((court) => (
          <div key={court} className="rounded-[4px] bg-surface-2 p-2">
            <div className="mb-1.5 flex items-center justify-between gap-3">
              <span className="font-mono text-[10px] uppercase tracking-wider text-ink-faint">
                Court {court}
              </span>
              <span className="relative flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber opacity-75" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-amber" />
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="flex gap-0.5">
                {[0, 1, 2, 3].map((i) => (
                  <span key={i} className="h-2.5 w-2.5 rounded-full bg-amber" />
                ))}
              </div>
              <span className="font-mono text-[9px] text-ink-faint">v</span>
              <div className="flex gap-0.5">
                {[0, 1, 2, 3].map((i) => (
                  <span key={i} className="h-2.5 w-2.5 rounded-full bg-blue" />
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>
      <div className="flex items-center gap-1.5">
        <span className="font-mono text-[9px] uppercase tracking-wider text-ink-faint">
          Next up
        </span>
        <div className="flex gap-1">
          {waitlist.map((p) => (
            <span
              key={p.label}
              className={
                p.state === 'in'
                  ? 'flex h-5 w-5 items-center justify-center rounded-full bg-amber font-mono text-[9px] font-bold text-ground'
                  : 'flex h-5 w-5 items-center justify-center rounded-full border border-dashed border-ink-faint font-mono text-[9px] text-ink-faint'
              }
            >
              {p.label}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

export function ScheduleGrid({ variant, compact }: { variant: PersonaId; compact?: boolean }) {
  switch (variant) {
    case 'tournament':
      return <TournamentGrid compact={compact} />;
    case 'league':
      return <LeagueStrip />;
    case 'dropin':
      return <DropInBoard />;
  }
}
