'use client';

import { useEffect, useState } from 'react';

/**
 * The two things you can take away from a demo that saves nothing.
 *
 * "Copy link" is the important one. Demo state lives entirely in the query
 * string, so the link *is* the save file — it reproduces the schedule exactly,
 * on anyone's machine, with no account and no row in a database that would
 * need authorizing when auth finally lands. The address bar is kept in step
 * as you change things, so the browser's own copy button works too.
 *
 * "Copy data" hands over the generated schedule as JSON: real `Match` rows
 * with the ids `src/lib/scheduling/match-ids.ts` minted, which is the shape
 * the app will eventually write. Every id in it is prefixed `demo-`, because
 * invented data that travels needs to keep saying it is invented.
 */

type Copied = 'link' | 'data' | null;

function useCopy() {
  const [copied, setCopied] = useState<Copied>(null);

  useEffect(() => {
    if (copied === null) return;
    const timer = setTimeout(() => setCopied(null), 2000);
    return () => clearTimeout(timer);
  }, [copied]);

  const copy = async (what: Exclude<Copied, null>, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(what);
    } catch {
      // Clipboard access can be refused outright — an insecure origin, or a
      // browser that gates it behind a permission. Saying nothing would look
      // like the button is broken.
      setCopied(null);
      window.prompt('Copy this:', text);
    }
  };

  return { copied, copy };
}

export function ShareBar({
  query,
  data,
  note = 'The link carries everything on screen.',
}: {
  query: string;
  data: unknown;
  note?: string;
}) {
  const { copied, copy } = useCopy();

  // Keep the address bar showing the state on screen. replaceState rather
  // than a router push: this is not navigation, and it should not fill up
  // the back button with every twiddle of a dropdown.
  useEffect(() => {
    const url = `${window.location.pathname}${query ? `?${query}` : ''}`;
    window.history.replaceState(null, '', url);
  }, [query]);

  const button =
    'rounded-sm bg-ink px-[15px] py-2 text-button-utility text-on-dark transition-transform duration-150 active:scale-95';

  return (
    <div className="flex flex-wrap items-center gap-3">
      <button
        type="button"
        className={button}
        onClick={() =>
          copy('link', `${window.location.origin}${window.location.pathname}?${query}`)
        }
      >
        {copied === 'link' ? 'Link copied' : 'Copy link'}
      </button>
      <button
        type="button"
        className={button}
        onClick={() => copy('data', JSON.stringify(data, null, 2))}
      >
        {copied === 'data' ? 'Data copied' : 'Copy data as JSON'}
      </button>
      <span className="text-caption text-ink-muted-80">{note}</span>
    </div>
  );
}
