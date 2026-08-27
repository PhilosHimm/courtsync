import Link from 'next/link';
import { PERSONAS, type Persona } from '@/lib/personas';
import { RhythmPulse } from './RhythmPulse';
import { ScheduleGrid } from './ScheduleGrid';

export function PersonaAreaPage({ persona }: { persona: Persona }) {
  const others = PERSONAS.filter((p) => p.id !== persona.id);

  return (
    <>
      <section className="border-b border-rule">
        <div className="mx-auto grid max-w-6xl gap-12 px-6 py-16 sm:py-20 lg:grid-cols-[1.1fr_1fr] lg:items-center">
          <div>
            <p className="font-mono text-xs uppercase tracking-[0.2em] text-amber">
              {persona.cadence}
            </p>
            <h1 className="mt-4 font-display text-4xl font-extrabold uppercase leading-[0.95] tracking-tight text-ink sm:text-5xl">
              {persona.title}
            </h1>
            <p className="mt-4 text-lg text-ink-dim">{persona.role}</p>
            <div className="mt-6 flex items-center gap-3">
              <RhythmPulse rhythm={persona.rhythm} />
              <span className="font-mono text-[11px] text-ink-faint">
                Opens CourtSync — {persona.cadence.toLowerCase()}
              </span>
            </div>
          </div>

          <div className="flex flex-col items-start gap-3 rounded-md border border-rule bg-surface p-6 lg:justify-self-end">
            <ScheduleGrid variant={persona.id} />
          </div>
        </div>
      </section>

      <section className="border-b border-rule">
        <div className="mx-auto max-w-3xl px-6 py-14">
          <p className="font-mono text-xs uppercase tracking-[0.2em] text-amber">
            The actual problem
          </p>
          <blockquote className="mt-4 border-l-2 border-amber pl-6 text-xl leading-relaxed text-ink">
            {persona.story}
          </blockquote>
          <p className="mt-6 text-ink-dim">
            <span className="font-mono text-[11px] uppercase tracking-wider text-ink-faint">
              Today, that means —{' '}
            </span>
            {persona.today}
          </p>
        </div>
      </section>

      <section className="border-b border-rule">
        <div className="mx-auto max-w-3xl px-6 py-14">
          <p className="font-mono text-xs uppercase tracking-[0.2em] text-amber">Peak need</p>
          <p className="mt-3 max-w-2xl text-2xl font-medium leading-snug text-ink">
            {persona.peakNeed}
          </p>
        </div>
      </section>

      <section className="border-b border-rule">
        <div className="mx-auto max-w-3xl px-6 py-14">
          <p className="font-mono text-xs uppercase tracking-[0.2em] text-amber">
            Where this area actually is
          </p>
          <div className="mt-5 grid gap-8 sm:grid-cols-2">
            <div>
              <h3 className="font-mono text-xs uppercase tracking-wide text-ink-dim">✅ Built</h3>
              <ul className="mt-3 space-y-2">
                {persona.status.done.map((item) => (
                  <li key={item} className="text-sm leading-relaxed text-ink-dim">
                    {item}
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h3 className="font-mono text-xs uppercase tracking-wide text-ink-dim">
                🔧 Being built
              </h3>
              <ul className="mt-3 space-y-2">
                {persona.status.building.map((item) => (
                  <li key={item} className="text-sm leading-relaxed text-ink-dim">
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      <section>
        <div className="mx-auto max-w-3xl px-6 py-14">
          <p className="font-mono text-xs uppercase tracking-[0.2em] text-ink-faint">
            The other two areas
          </p>
          <div className="mt-4 flex flex-wrap gap-4">
            {others.map((p) => (
              <Link
                key={p.id}
                href={p.route}
                className="rounded-sm border border-rule px-4 py-2 font-mono text-xs uppercase tracking-wide text-ink-dim transition-colors hover:border-amber/60 hover:text-ink"
              >
                {p.title} →
              </Link>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
