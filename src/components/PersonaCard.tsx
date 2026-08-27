import Link from 'next/link';
import type { Persona } from '@/lib/personas';
import { RhythmPulse } from './RhythmPulse';

export function PersonaCard({ persona }: { persona: Persona }) {
  return (
    <Link
      href={persona.route}
      className="group flex flex-col gap-4 rounded-md border border-rule bg-surface p-6 transition-colors hover:border-amber/60"
    >
      <div className="flex items-start justify-between gap-4">
        <h3 className="font-display text-2xl font-bold uppercase leading-none text-ink">
          {persona.title}
        </h3>
        <span className="font-mono text-[10px] uppercase tracking-wider text-ink-faint">
          {String(persona.id).slice(0, 2)}
        </span>
      </div>

      <p className="text-sm text-ink-dim">{persona.role}</p>

      <div className="flex items-center gap-3 border-t border-rule pt-4">
        <RhythmPulse rhythm={persona.rhythm} />
        <span className="font-mono text-[11px] text-ink-faint">{persona.cadence}</span>
      </div>

      <p className="text-sm leading-relaxed text-ink-dim">
        <span className="font-mono text-[10px] uppercase tracking-wider text-amber">
          Peak need —{' '}
        </span>
        {persona.peakNeed}
      </p>

      <span className="mt-auto font-mono text-xs uppercase tracking-wide text-ink-dim transition-colors group-hover:text-amber">
        See the {(persona.title.split(' ')[0] ?? persona.title).toLowerCase()} area →
      </span>
    </Link>
  );
}
