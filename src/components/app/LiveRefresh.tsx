'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

/**
 * Live scores by polling (#23): refresh the page's server data every ~25
 * seconds while the tab is visible. No realtime layer — SCOPE.md rules one
 * out, Neon does not provide one, and for one gym a poll is plenty. Paused in
 * a background tab so a phone in a pocket is not polling all afternoon.
 */
export function LiveRefresh({ seconds = 25 }: { seconds?: number }) {
  const router = useRouter();
  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | undefined;
    const start = () => {
      stop();
      timer = setInterval(() => router.refresh(), seconds * 1000);
    };
    const stop = () => {
      if (timer) clearInterval(timer);
      timer = undefined;
    };
    const onVisibility = () => {
      if (document.visibilityState !== 'visible') return stop();
      router.refresh();
      start();
    };
    start();
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      stop();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [router, seconds]);
  return (
    <p className="text-caption text-ink-muted-80" aria-live="off">
      Scores update every {seconds} seconds while this page is open.
    </p>
  );
}
