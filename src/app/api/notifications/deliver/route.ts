import { timingSafeEqual } from 'node:crypto';
import { getDb } from '@/lib/db/client';
import { serverEnv } from '@/lib/db/env';
import { deliverDue } from '@/lib/db/notify';

/**
 * Send what is due. Called by a scheduler (the Deliver notifications workflow,
 * .github/workflows/deliver-notifications.yml) with
 * `Authorization: Bearer $CRON_SECRET` — never by a page. With no provider
 * configured it does nothing: messages stay queued and visible in-app.
 */
export async function GET(request: Request) {
  const env = serverEnv();
  if (!env.cronSecret)
    return Response.json({ sent: 0, failed: 0, note: 'No delivery provider is configured.' });
  const given = Buffer.from(request.headers.get('authorization') ?? '');
  const expected = Buffer.from(`Bearer ${env.cronSecret}`);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
    return new Response('Unauthorized', { status: 401 });
  }
  const result = await deliverDue(await getDb(), env, fetch, new Date().toISOString());
  return Response.json(result);
}
