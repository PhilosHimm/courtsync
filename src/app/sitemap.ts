import type { MetadataRoute } from 'next';
import { getDb } from '@/lib/db/client';
import { serverEnv } from '@/lib/db/env';
import { listPublicEvents } from '@/lib/db/public';

export const dynamic = 'force-dynamic';

/** The static pages and every published event, for search engines (#23). */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = serverEnv().appUrl;
  const events = await listPublicEvents(await getDb());
  return [
    ...['', '/tournaments', '/leagues', '/dropins', '/demo', '/e'].map((path) => ({
      url: `${base}${path}`,
    })),
    ...events.map((e) => ({ url: `${base}/e/${e.id}` })),
  ];
}
