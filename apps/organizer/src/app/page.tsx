import Link from 'next/link';
import { PersonaCard } from '@/components/PersonaCard';
import { ScheduleGrid } from '@/components/ScheduleGrid';
import { PERSONAS } from '@/lib/personas';

export default function HomePage() {
  return (
    <>
      {/* Hero — the schedule grid is the thesis, not an illustration of one. */}
      <section className="border-b border-rule">
        <div className="mx-auto grid max-w-6xl gap-12 px-6 py-16 sm:py-24 lg:grid-cols-[1.1fr_1fr] lg:items-center">
          <div>
            <p className="font-mono text-xs uppercase tracking-[0.2em] text-amber">
              Scheduling for volleyball — tournaments · leagues · drop-ins
            </p>
            <h1 className="mt-5 font-display text-4xl font-extrabold uppercase leading-[0.95] tracking-tight text-ink sm:text-5xl lg:text-6xl">
              A tournament, a season, a Thursday night drop-in —{' '}
              <span className="text-amber">one schedule</span> that doesn&rsquo;t fall apart.
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-ink-dim">
              CourtSync is open-source scheduling for volleyball organizers. One data model built to
              hold a one-day bracket, a ten-week season, and a Tuesday night open gym — without
              pretending they&rsquo;re the same thing underneath.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-6">
              <a
                href="#personas"
                className="rounded-sm bg-amber px-5 py-2.5 font-mono text-xs font-medium uppercase tracking-wide text-ground transition-opacity hover:opacity-90"
              >
                Find your area
              </a>
              <a
                href="https://github.com/PhilosHimm/courtsync"
                className="font-mono text-xs uppercase tracking-wide text-ink-dim underline decoration-rule underline-offset-4 transition-colors hover:text-ink"
              >
                Read the plan on GitHub
              </a>
            </div>
          </div>

          <div className="flex flex-col items-start gap-3 rounded-md border border-rule bg-surface p-6 lg:justify-self-end">
            <ScheduleGrid variant="tournament" />
            <p className="font-mono text-[10px] leading-relaxed text-ink-faint">
              A Saturday, four courts, six rounds — the shape most schedule tools are actually built
              for. It is one of three CourtSync has to hold.
            </p>
          </div>
        </div>
      </section>

      {/* Three personas */}
      <section id="personas" className="border-b border-rule scroll-mt-16">
        <div className="mx-auto max-w-6xl px-6 py-16 sm:py-20">
          <p className="font-mono text-xs uppercase tracking-[0.2em] text-amber">
            Three personas, one format each
          </p>
          <h2 className="mt-3 max-w-2xl font-display text-3xl font-bold uppercase leading-tight text-ink sm:text-4xl">
            Not one operator wearing three hats.
          </h2>
          <p className="mt-4 max-w-2xl text-ink-dim">
            They share the same material — courts, time slots, participants, matches. What differs
            is the rhythm of the work, and that rhythm is what the product is actually built around.
          </p>

          <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {PERSONAS.map((persona) => (
              <PersonaCard key={persona.id} persona={persona} />
            ))}
          </div>
        </div>
      </section>

      {/* Why one model — the positioning claim, shown structurally */}
      <section className="border-b border-rule">
        <div className="mx-auto grid max-w-6xl gap-10 px-6 py-16 sm:py-20 lg:grid-cols-[1fr_auto] lg:items-start">
          <div>
            <p className="font-mono text-xs uppercase tracking-[0.2em] text-amber">
              Why one model, not three apps
            </p>
            <h2 className="mt-3 max-w-xl font-display text-3xl font-bold uppercase leading-tight text-ink sm:text-4xl">
              A schedule tool built around <em className="not-italic text-amber">Session</em>, not{' '}
              <em className="not-italic text-ink-faint line-through">Tournament</em>.
            </h2>
            <p className="mt-4 max-w-xl text-ink-dim">
              Most tools root their whole model on the event that happens once. Add a season and you
              are not adding a feature — you are fighting the schema. CourtSync roots on{' '}
              <strong className="text-ink">Session</strong>, one date of play: a tournament has one,
              a league has one a week, a drop-in has an open-ended series. Everything else — courts,
              timeslots, standings — hangs off that.
            </p>
          </div>

          <pre className="whitespace-pre rounded-md border border-rule bg-surface px-6 py-5 font-mono text-[13px] leading-[1.7] text-ink-dim">
            {`Organization
└─ Competition        tournament · league · dropin
   ├─ Session          one date of play
   │  └─ Timeslot      the court × time grid
   ├─ Participant      a team, or a person
   └─ Match
      └─ MatchSet`}
          </pre>
        </div>
      </section>

      {/* Honest status — no invented traction, per PRODUCT.md */}
      <section>
        <div className="mx-auto max-w-6xl px-6 py-16 sm:py-20">
          <div className="rounded-md border border-rule bg-surface-2 p-8">
            <p className="font-mono text-xs uppercase tracking-[0.2em] text-amber">
              Where this actually is
            </p>
            <h2 className="mt-3 font-display text-2xl font-bold uppercase text-ink">
              Nothing here is pretending to be finished.
            </h2>
            <p className="mt-3 max-w-2xl text-ink-dim">
              CourtSync has never been deployed and has no users yet. The domain model, the Neon
              schema, and the test specifications for scheduling are built. The scheduling engine
              itself and the auth layer are still being built — see each area page for exactly what
              is done and what is next.
            </p>
            <Link
              href="/tournaments"
              className="mt-5 inline-block font-mono text-xs uppercase tracking-wide text-ink-dim underline decoration-rule underline-offset-4 transition-colors hover:text-ink"
            >
              Start with the tournament area →
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
