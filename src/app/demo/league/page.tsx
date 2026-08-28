import type { Metadata } from 'next';
import { LeagueBoard } from '@/components/demo/LeagueBoard';
import { Tile } from '@/components/Tile';
import type { QueryParams } from '@/lib/demo';
import { parseFlips, parseLeagueConfig } from '@/lib/demo';

export const metadata: Metadata = {
  title: 'League demo — CourtSync',
  description:
    'Run a season through the real CourtSync scheduling engine: weekly fixtures, each week on its own grid, and a table computed from results rather than stored.',
};

export default async function LeagueDemoPage({
  searchParams,
}: {
  searchParams: Promise<QueryParams>;
}) {
  const params = await searchParams;

  return (
    <>
      <Tile surface="canvas" width="wide">
        <h1 className="text-display-md sm:text-display-lg">League demo</h1>
        <p className="mt-4 max-w-2xl text-body text-ink-muted-80">
          A season, one night a week. Move the weeks played and the table follows, because there is
          no table — only matches, and a function that reads them.
        </p>
      </Tile>

      <Tile surface="parchment" width="wide">
        <LeagueBoard initialConfig={parseLeagueConfig(params)} initialFlips={parseFlips(params)} />
      </Tile>
    </>
  );
}
