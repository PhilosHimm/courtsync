import type { Metadata } from 'next';
import { DropInBoard } from '@/components/demo/DropInBoard';
import { Tile } from '@/components/Tile';
import type { QueryParams } from '@/lib/demo';
import { parseDropInConfig } from '@/lib/demo';

export const metadata: Metadata = {
  title: 'Drop-in demo — CourtSync',
  description:
    'Run a drop-in night through the real CourtSync engine: capacity, waitlist promotion in arrival order, and a rotation that shares court time out evenly.',
};

export default async function DropInDemoPage({
  searchParams,
}: {
  searchParams: Promise<QueryParams>;
}) {
  const params = await searchParams;

  return (
    <>
      <Tile surface="canvas" width="wide">
        <h1 className="text-display-md sm:text-display-lg">Drop-in demo</h1>
        <p className="mt-4 max-w-2xl text-body text-ink-muted-80">
          Individuals, not teams. The interesting part is the door — capacity, the waitlist, and who
          actually turned up — and only then who is on which court.
        </p>
      </Tile>

      <Tile surface="parchment" width="wide">
        <DropInBoard initialConfig={parseDropInConfig(params)} />
      </Tile>
    </>
  );
}
