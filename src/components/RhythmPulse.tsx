import type { RhythmTick } from '@/lib/personas';

/**
 * Twelve ticks, one loosely per month. Lit ticks are moments this persona
 * actually opens the app — sparse for the tournament organizer, weekly for
 * the league convener, constant for the drop-in host. The pattern is real
 * cadence data (see lib/personas.ts), not a decorative bar chart.
 */
export function RhythmPulse({ rhythm }: { rhythm: readonly RhythmTick[] }) {
  return (
    <div className="flex items-end gap-[3px]" aria-hidden="true">
      {rhythm.map((tick, i) => (
        <span
          key={i}
          className={
            tick.lit ? 'h-4 w-[3px] rounded-full bg-ink' : 'h-2 w-[3px] rounded-full bg-hairline'
          }
        />
      ))}
    </div>
  );
}
