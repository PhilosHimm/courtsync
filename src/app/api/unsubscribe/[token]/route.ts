import { getDb } from '@/lib/db/client';
import { unsubscribe } from '@/lib/db/notify';

/**
 * RFC 8058 one-click unsubscribe: the mail client POSTs here from the
 * List-Unsubscribe header. POST only — a GET that unsubscribed would be
 * triggered by every link scanner that prefetches an email.
 */
export async function POST(_: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  await unsubscribe(await getDb(), token, new Date().toISOString());
  return new Response(null, { status: 204 });
}
