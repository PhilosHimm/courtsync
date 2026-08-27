import Link from 'next/link';
import type { Persona } from '@/lib/personas';
import { RhythmPulse } from './RhythmPulse';

/**
 * The utility-card grammar: white on parchment, one hairline, the 18px
 * radius, 24px of padding. No shadow — cards do not get elevation in this
 * system, only the product render does.
 */
export function PersonaCard({ persona }: { persona: Persona }) {
  return (
    <Link
      href={persona.route}
      className="flex flex-col gap-4 rounded-lg border border-hairline bg-canvas p-6 transition-transform duration-150 active:scale-95"
    >
      <h3 className="text-tagline text-ink">{persona.title}</h3>

      <p className="text-caption text-ink-muted-80">{persona.role}</p>

      <div className="flex items-center gap-3">
        <RhythmPulse rhythm={persona.rhythm} />
        <span className="text-micro-legal text-ink-muted-80">{persona.cadence}</span>
      </div>

      <p className="text-caption text-ink-muted-80">
        <span className="text-caption-strong text-ink">Peak need — </span>
        {persona.peakNeed}
      </p>

      <span className="mt-auto text-caption text-primary">
        See the {(persona.title.split(' ')[0] ?? persona.title).toLowerCase()} area
      </span>
    </Link>
  );
}
