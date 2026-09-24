import { getDb } from '@/lib/db/client';
import { NotFoundError } from '@/lib/db/errors';
import { readSnapshot } from '@/lib/db/snapshot';
import { publicSnapshot } from '@/lib/event/names';
import { eventPdf } from '@/lib/event/pdf';

/** The public sheet: a published event only, with people reduced to first name and initial. */
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new Response('Not found.', { status: 404 });
  const db = await getDb();
  const { rows } = await db.query<{ status: string }>(
    'select status from competition where id = $1',
    [id],
  );
  if (rows[0]?.status !== 'published') return new Response('Not found.', { status: 404 });
  try {
    const event = publicSnapshot(await readSnapshot(db, id));
    const bytes = await eventPdf(event, new Date().toISOString());
    return new Response(Buffer.from(bytes), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="${event.competition.slug}.pdf"`,
      },
    });
  } catch (error) {
    if (error instanceof NotFoundError) return new Response('Not found.', { status: 404 });
    throw error;
  }
}
