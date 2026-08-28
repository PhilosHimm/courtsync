import { ButtonAnchor, ButtonLink, TextLink } from '@/components/Button';
import { PersonaCard } from '@/components/PersonaCard';
import { ScheduleGrid, Stage } from '@/components/ScheduleGrid';
import { Tile } from '@/components/Tile';
import { PERSONAS } from '@/lib/personas';

/**
 * The section rhythm is the system's: light hero, parchment utility grid, dark
 * product tile, light close. Tiles touch edge to edge and the surface change
 * is the only divider — there are deliberately no rules between sections.
 */

/** The model, as typographic structure rather than an ASCII diagram. */
const MODEL = [
  { depth: 0, name: 'Organization', note: null },
  { depth: 1, name: 'Competition', note: 'tournament · league · drop-in' },
  { depth: 2, name: 'Session', note: 'one date of play' },
  { depth: 3, name: 'Timeslot', note: 'the court × time grid' },
  { depth: 2, name: 'Participant', note: 'a team, or a person' },
  { depth: 2, name: 'Match', note: null },
  { depth: 3, name: 'MatchSet', note: 'so a best-of-three has somewhere to live' },
] as const;

export default function HomePage() {
  return (
    <>
      {/* Hero — the schedule grid is the thesis, not an illustration of one. */}
      <Tile surface="canvas" className="text-center">
        <h1 className="mx-auto max-w-3xl text-display-md sm:text-display-lg lg:text-hero">
          A tournament, a season, a Thursday night drop-in — one schedule that doesn&rsquo;t fall
          apart.
        </h1>
        <p className="mx-auto mt-5 max-w-2xl text-lead text-ink-muted-80">
          Open-source scheduling for volleyball organizers.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
          <ButtonLink href="/demo">Run the demo</ButtonLink>
          <ButtonAnchor href="#areas" variant="secondary">
            Find your area
          </ButtonAnchor>
        </div>

        <div className="mt-16 flex justify-center">
          <Stage>
            <ScheduleGrid variant="tournament" />
          </Stage>
        </div>
        <p className="mx-auto mt-6 max-w-md text-caption text-ink-muted-80">
          A Saturday, four courts, six rounds — the shape most schedule tools are built for. It is
          one of three CourtSync has to hold.
        </p>
      </Tile>

      {/* Three personas, as a utility card grid. */}
      <Tile surface="parchment" width="wide" id="areas" className="scroll-mt-[52px]">
        <div className="text-center">
          <h2 className="text-display-md sm:text-display-lg">
            Not one operator wearing three hats.
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-body text-ink-muted-80">
            They share the same material — courts, time slots, participants, matches. What differs
            is the rhythm of the work, and that rhythm is what the product is built around.
          </p>
        </div>

        <div className="mx-auto mt-12 grid max-w-6xl gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {PERSONAS.map((persona) => (
            <PersonaCard key={persona.id} persona={persona} />
          ))}
        </div>
      </Tile>

      {/* The positioning claim, on the dark band. */}
      <Tile surface="dark">
        <div className="text-center">
          <h2 className="mx-auto max-w-3xl text-display-md sm:text-display-lg">
            Built around <span className="text-primary-on-dark">Session</span>, not Tournament.
          </h2>
          <p className="mx-auto mt-5 max-w-2xl text-body text-body-muted">
            Most tools root their whole model on the event that happens once. Add a season and you
            are not adding a feature — you are fighting the schema. CourtSync roots on Session, one
            date of play: a tournament has one, a league has one a week, a drop-in has an open-ended
            series.
          </p>
        </div>

        <ul className="mx-auto mt-12 max-w-xl">
          {MODEL.map((row) => (
            <li
              key={row.name}
              className="flex flex-wrap items-baseline gap-x-3 py-2.5"
              style={{ paddingLeft: `${row.depth * 24}px` }}
            >
              <span className={row.depth === 0 ? 'text-body-strong' : 'text-body'}>{row.name}</span>
              {row.note && <span className="text-caption text-body-muted">{row.note}</span>}
            </li>
          ))}
        </ul>
      </Tile>

      {/* Honest status — no invented traction, per PRODUCT.md. */}
      <Tile surface="canvas" className="text-center">
        <h2 className="mx-auto max-w-3xl text-display-md sm:text-display-lg">
          The engine is finished. The app around it is not.
        </h2>
        <p className="mx-auto mt-5 max-w-2xl text-body text-ink-muted-80">
          CourtSync has never been deployed and has no users yet. What is done is the part
          underneath: the domain model, the Neon schema, and the whole scheduling engine — pool
          play, referees, standings, bracket seeding, drop-in rotation and league fixtures, each
          with a passing spec suite behind it and none skipped. What is not done is everything you
          would touch: no screens that save, and no auth yet to put in front of them.
        </p>
        {/* A repo-wide test total used to sit in the sentence above and went
            stale, which is the exact drift BuildBoxScore's per-row counts
            exist to prevent. The per-area numbers are the claim; this
            paragraph does not restate them, and the demo lets anyone check
            the engine without taking either on trust. */}
        <p className="mt-8 text-body">
          <TextLink href="/demo">Run the engine yourself</TextLink>
        </p>
      </Tile>
    </>
  );
}
