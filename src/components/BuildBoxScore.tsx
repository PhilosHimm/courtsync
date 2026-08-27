import type { Persona } from '@/lib/personas';

/**
 * The build box score: what is actually finished in this area, and the number
 * of passing tests standing behind each piece.
 *
 * A box score is the artifact volleyball already uses to report what happened
 * — named things in rows, counts in a column — and it is the honest shape for
 * this because in this project the tests *are* the evidence (docs/ARCHITECTURE.md:
 * the human "reads test results rather than auditing every line"). So the counts
 * here are load-bearing, not ornament: every number is a real passing suite and
 * `npm test` reproduces all of them.
 *
 * This replaced a hand-written "Built / Being built" list that had gone stale —
 * it still promised pool play and the rotation algorithm as future work months
 * after both shipped. Reading counts off the suites is what stops that
 * happening twice.
 *
 * The counts are set in ink rather than the accent colour. Blue is this
 * system's click signal and nothing else; spending it on a number nobody can
 * click would weaken the one place it means something.
 */

function Tally({ n }: { n: number }) {
  return (
    <span className="w-14 shrink-0 text-right text-display-md text-ink sm:text-display-lg">
      {n}
      <span className="sr-only"> {n === 1 ? 'test' : 'tests'}</span>
    </span>
  );
}

export function BuildBoxScore({ persona }: { persona: Persona }) {
  const { coverage, endToEnd, notYet } = persona.status;

  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
        <h2 className="text-display-md">Built and tested</h2>
        {/* No repo-wide total here on purpose: a hard-coded grand total goes
            stale the moment anyone adds a suite anywhere — which is the drift
            this section exists to correct. The per-row counts are the claim,
            and the command reproduces them. */}
        <p className="text-caption text-ink-muted-80">
          every number is a passing suite — <code>npm test</code>
        </p>
      </div>

      <ul className="mt-8 divide-y divide-hairline border-y border-hairline">
        {coverage.map((row) => (
          <li key={row.fn} className="flex items-start gap-6 px-4 py-5">
            <Tally n={row.tests} />
            <div className="min-w-0">
              <p className="text-body-strong text-ink">{row.fn}</p>
              <p className="mt-1 text-body text-ink-muted-80">{row.gloss}</p>
              {row.sharedWith && (
                /* The one-model claim, where it is literally true. */
                <p className="mt-1 text-caption text-ink-muted-80">
                  the same function runs {row.sharedWith}
                </p>
              )}
            </div>
          </li>
        ))}

        {/* Set apart because it counts something different: not a function
            working, but the whole format working together. A surface change,
            not a border — the system separates things by changing ground. */}
        <li className="flex items-start gap-6 bg-parchment px-4 py-5">
          <Tally n={endToEnd.tests} />
          <div className="min-w-0">
            <p className="text-body-strong text-ink">integration.test.ts</p>
            <p className="mt-1 text-body text-ink-muted-80">End to end: runs {endToEnd.suite}.</p>
          </div>
        </li>
      </ul>

      <div className="mt-10">
        <h3 className="text-caption-strong text-ink-muted-80">Not yet</h3>
        <ul className="mt-3 space-y-2">
          {notYet.map((item) => (
            <li key={item} className="flex items-baseline gap-3">
              {/* An unlit tick — the same vocabulary RhythmPulse uses for a
                  beat that has not happened. */}
              <span className="h-px w-3 shrink-0 bg-hairline" aria-hidden="true" />
              <span className="text-body text-ink-muted-80">{item}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
