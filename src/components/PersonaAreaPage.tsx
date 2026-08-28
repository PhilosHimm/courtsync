import { PERSONAS, type Persona } from '@/lib/personas';
import { BuildBoxScore } from './BuildBoxScore';
import { ButtonLink, TextLink } from './Button';
import { RhythmPulse } from './RhythmPulse';
import { ScheduleGrid, Stage } from './ScheduleGrid';
import { Tile } from './Tile';

/**
 * One area page per persona, on the system's section pulse: light hero,
 * parchment narrative, dark statement, light evidence, dark close. The
 * surface change between tiles is the only divider.
 */
export function PersonaAreaPage({ persona }: { persona: Persona }) {
  const others = PERSONAS.filter((p) => p.id !== persona.id);

  return (
    <>
      <Tile surface="canvas" className="text-center">
        <h1 className="text-display-md sm:text-display-lg lg:text-hero">{persona.title}</h1>
        <p className="mx-auto mt-4 max-w-2xl text-lead text-ink-muted-80">{persona.role}</p>

        <div className="mt-6 flex items-center justify-center gap-3">
          <RhythmPulse rhythm={persona.rhythm} />
          <span className="text-caption text-ink-muted-80">
            Opens CourtSync — {persona.cadence.toLowerCase()}
          </span>
        </div>

        <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
          <ButtonLink href={persona.demoRoute}>Run the demo</ButtonLink>
        </div>

        <div className="mt-16 flex justify-center">
          <Stage>
            <ScheduleGrid variant={persona.id} />
          </Stage>
        </div>
        <p className="mx-auto mt-6 max-w-md text-caption text-ink-muted-80">
          Schematic, not a live board. The demo above runs the real engine.
        </p>
      </Tile>

      {/* The narrative, at the airy weight the system reserves for a slow read. */}
      <Tile surface="parchment">
        <p className="mx-auto max-w-3xl text-lead-airy text-ink">{persona.story}</p>
        <p className="mx-auto mt-8 max-w-3xl text-body text-ink-muted-80">
          <span className="text-body-strong text-ink">Today, that means — </span>
          {persona.today}
        </p>
      </Tile>

      {/* Peak need: one sentence, alone on the dark band. */}
      <Tile surface="dark" className="text-center">
        <p className="mx-auto max-w-3xl text-display-md sm:text-display-lg">{persona.peakNeed}</p>
      </Tile>

      <Tile surface="canvas">
        <BuildBoxScore persona={persona} />
      </Tile>

      <Tile surface="dark-2" className="text-center">
        <h2 className="text-tagline">The other two areas</h2>
        <p className="mx-auto mt-3 max-w-xl text-body text-body-muted">
          Same courts, same participants, same matches underneath — a different rhythm on top.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-4">
          {others.map((p) => (
            <ButtonLink key={p.id} href={p.route}>
              {p.title}
            </ButtonLink>
          ))}
        </div>
        <p className="mt-8 text-body">
          <TextLink href="/" onDark>
            Back to the overview
          </TextLink>
        </p>
      </Tile>
    </>
  );
}
