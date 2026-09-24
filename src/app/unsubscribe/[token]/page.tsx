import type { Metadata } from 'next';
import { Tile } from '@/components/Tile';
import { confirmUnsubscribe } from './actions';

export const metadata: Metadata = {
  title: 'Unsubscribe — CourtSync',
  robots: { index: false },
  referrer: 'no-referrer',
};

/**
 * The unsubscribe link in an email's footer. One tap, signed out — a legal
 * requirement, not a courtesy. The tap is a POST: opening the page changes
 * nothing, so a mail scanner that prefetches links cannot unsubscribe anyone.
 */
export default async function UnsubscribePage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ done?: string }>;
}) {
  const { token } = await params;
  const { done } = await searchParams;
  return (
    <Tile surface="parchment">
      {done === '1' ? (
        <>
          <h1 className="text-display-md">You are unsubscribed</h1>
          <p className="mt-2 max-w-xl text-body">
            CourtSync will not email or text you again. Turn messages back on from your schedule
            page any time.
          </p>
        </>
      ) : done === '0' ? (
        <>
          <h1 className="text-display-md">This link has already been used</h1>
          <p className="mt-2 max-w-xl text-body">
            You may already be unsubscribed, or a newer email carries a newer link. Your choices are
            on your schedule page.
          </p>
        </>
      ) : (
        <>
          <h1 className="text-display-md">Stop CourtSync messages?</h1>
          <p className="mt-2 max-w-xl text-body">
            This turns off every email and text CourtSync sends you.
          </p>
          <form action={confirmUnsubscribe} className="mt-6">
            <input type="hidden" name="token" value={token} />
            <button
              type="submit"
              className="rounded-full bg-primary px-[22px] py-[11px] text-body text-on-dark"
            >
              Unsubscribe
            </button>
          </form>
        </>
      )}
    </Tile>
  );
}
