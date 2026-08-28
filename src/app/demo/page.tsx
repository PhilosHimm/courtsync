import type { Metadata } from 'next';
import Link from 'next/link';
import { ButtonAnchor, ButtonLink, TextLink } from '@/components/Button';
import { Tile } from '@/components/Tile';

export const metadata: Metadata = {
  title: 'Demo — CourtSync',
  description:
    'Run the CourtSync scheduling engine in the browser: a tournament, a league season and a drop-in night. No account, no database, nothing saved.',
};

/**
 * Demo mode's front door.
 *
 * The claim this page has to make honestly is a narrow one. CourtSync's
 * scheduling engine is finished and tested and its app is not, and the gap
 * between those two facts is invisible from the outside — "the engine works"
 * is exactly what someone says when it does not. So the demo runs the real
 * thing in the browser and lets anyone check.
 *
 * What it deliberately does not do is pretend to be the product. There is
 * nothing to sign in to, nothing is written anywhere, and the copy below
 * says so rather than leaving it to be discovered. docs/SCOPE.md is blunt
 * that building for the demo rather than the organizer inverts this
 * project's priorities; the demo earns its place by being a window onto
 * work that already existed, not by becoming the work.
 */

const AREAS = [
  {
    href: '/demo/tournament',
    title: 'Tournament',
    blurb:
      'Twelve teams, three pools, three courts. Draw, schedule, referee, rank, seed, advance — then correct a quarterfinal score and watch the rest of the bracket reshape itself.',
    engine:
      'drawPools · generatePoolPlay · assignReferees · computeStandings · seedBrackets · advanceBracket',
  },
  {
    href: '/demo/league',
    title: 'League season',
    blurb:
      'Eight teams, ten Tuesdays, each week on its own grid. Slide how many weeks have been played and watch the table follow — because the table is computed, not kept.',
    engine: 'generateLeagueFixtures · computeStandings',
  },
  {
    href: '/demo/dropins',
    title: 'Drop-in night',
    blurb:
      'Twenty-two sign-ups against eighteen places. Add no-shows, watch the waitlist promote in arrival order and renumber, then see the rotation share court time out evenly.',
    engine: 'promoteFromWaitlist · generateDropInRotation',
  },
] as const;

export default function DemoIndexPage() {
  return (
    <>
      <Tile surface="canvas" className="text-center">
        <h1 className="mx-auto max-w-3xl text-display-md sm:text-display-lg lg:text-hero">
          The engine is finished. Here it is, running.
        </h1>
        <p className="mx-auto mt-5 max-w-2xl text-lead text-ink-muted-80">
          A tournament, a season and a drop-in night, generated in your browser by the same
          functions the real app will call.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
          <ButtonLink href="/demo/tournament">Start with a tournament</ButtonLink>
          <ButtonAnchor
            href="https://github.com/PhilosHimm/courtsync/tree/main/src/lib/scheduling"
            variant="secondary"
          >
            Read the engine
          </ButtonAnchor>
        </div>
      </Tile>

      <Tile surface="parchment" width="wide">
        <div className="mx-auto grid max-w-6xl gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {AREAS.map((area) => (
            <Link
              key={area.href}
              href={area.href}
              className="flex flex-col gap-4 rounded-lg border border-hairline bg-canvas p-6 transition-transform duration-150 active:scale-95"
            >
              <h2 className="text-tagline text-ink">{area.title}</h2>
              <p className="text-caption text-ink-muted-80">{area.blurb}</p>
              <p className="mt-auto break-words text-micro-legal text-ink-muted-80">
                {area.engine}
              </p>
              <span className="text-caption text-primary">Open the demo</span>
            </Link>
          ))}
        </div>
      </Tile>

      <Tile surface="dark">
        <div className="text-center">
          <h2 className="mx-auto max-w-3xl text-display-md sm:text-display-lg">
            No account, no database, <span className="text-primary-on-dark">nothing saved</span>.
          </h2>
          <p className="mx-auto mt-5 max-w-2xl text-body text-body-muted">
            Every schedule here is computed in the page from what is in the address bar. There is no
            server to write to and no session to hold, which is why the demo can ship while the auth
            decision is still open — when authorization arrives it goes in front of the real app,
            and demo mode needs no exception carved out for it.
          </p>
        </div>

        <ul className="mx-auto mt-12 max-w-2xl">
          {[
            [
              'Reproducible',
              'The link is the save file. Send it and the other person sees your schedule.',
            ],
            [
              'Copyable',
              'Take the generated schedule out as JSON — real Match rows, real match ids.',
            ],
            [
              'Invented',
              'Team A, Player 07, Demo Gym. No rosters, no results, no records of anything.',
            ],
            [
              'Honest about gaps',
              'When the day is too short for the field, it says so instead of dropping matches.',
            ],
          ].map(([term, definition]) => (
            <li key={term} className="flex flex-wrap items-baseline gap-x-3 py-2.5">
              <span className="text-body-strong">{term}</span>
              <span className="text-caption text-body-muted">{definition}</span>
            </li>
          ))}
        </ul>
      </Tile>

      <Tile surface="canvas" className="text-center">
        <h2 className="mx-auto max-w-3xl text-display-md sm:text-display-lg">
          What this is not yet.
        </h2>
        <p className="mx-auto mt-5 max-w-2xl text-body text-ink-muted-80">
          There is no setup wizard, no score entry beyond turning a result around, no way to keep a
          competition, and no accounts. CourtSync has never been deployed and has no users. The demo
          exists so the part that <em>is</em> finished can be checked by anyone, rather than taken
          on trust.
        </p>
        <p className="mt-8 text-body">
          <TextLink href="/tournaments">See what each area is actually for</TextLink>
        </p>
      </Tile>
    </>
  );
}
