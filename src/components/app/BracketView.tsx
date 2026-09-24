import Link from 'next/link';
import type { BracketStage } from '@/lib/event/bracket-stages';
import { sideText } from '@/lib/event/bracket-stages';

/**
 * The bracket on a phone (#29): one stage at a time, chosen from a row of
 * stage links, readable without pinch-zoom and keyboard-navigable by
 * construction. `list` renders every stage as plain lists — the alternative
 * for anyone a visual bracket does not serve.
 *
 * A bye reads "Bye"; a side still to come reads "Winner of QF 2". They never
 * look the same, because they are not the same.
 */
export function BracketView({
  tier,
  stages,
  current,
  hrefFor,
  mode,
  listHref,
  stagesHref,
}: {
  tier: string;
  stages: readonly BracketStage[];
  current: BracketStage['key'] | undefined;
  hrefFor: (stage: BracketStage['key']) => string;
  mode: 'stages' | 'list';
  listHref: string;
  stagesHref: string;
}) {
  const shown =
    mode === 'list' ? stages : stages.filter((s) => s.key === (current ?? stages[0]?.key));
  return (
    <section aria-label={`${tier} bracket`} className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-tagline capitalize">{tier}</h2>
        <Link href={mode === 'list' ? stagesHref : listHref} className="text-caption text-primary">
          {mode === 'list' ? 'Show one stage at a time' : 'Show as a list'}
        </Link>
      </div>
      {mode === 'stages' && (
        <nav aria-label={`${tier} stages`}>
          <ul className="flex flex-wrap gap-2">
            {stages.map((stage) => {
              const active = stage.key === (current ?? stages[0]?.key);
              return (
                <li key={stage.key}>
                  <Link
                    href={hrefFor(stage.key)}
                    aria-current={active ? 'page' : undefined}
                    scroll={false}
                    className={`block rounded-full border px-4 py-2 text-caption ${active ? 'border-ink bg-ink text-on-dark' : 'border-hairline'}`}
                  >
                    {stage.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      )}
      {shown.map((stage) => (
        <div key={stage.key} className="flex flex-col gap-2">
          {mode === 'list' && <h3 className="text-body-strong">{stage.label}</h3>}
          <ol className="grid gap-3 sm:grid-cols-2">
            {stage.matches.map((m) => (
              <li key={m.matchId} className="rounded-lg border border-hairline p-4">
                <p className="text-caption text-ink-muted-80">
                  {m.title} · {m.statusText}
                </p>
                <p className={`mt-1 text-body ${m.winner === 'home' ? 'text-body-strong' : ''}`}>
                  {m.winner === 'home' && <span className="sr-only">Winner: </span>}
                  {sideText(m.home)}
                </p>
                <p className={`text-body ${m.winner === 'away' ? 'text-body-strong' : ''}`}>
                  {m.winner === 'away' && <span className="sr-only">Winner: </span>}
                  {sideText(m.away)}
                </p>
                {m.score && <p className="mt-1 text-caption">{m.score}</p>}
              </li>
            ))}
          </ol>
        </div>
      ))}
    </section>
  );
}
