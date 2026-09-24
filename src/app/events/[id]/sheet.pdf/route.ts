import { actorOf, currentUser } from '@/lib/auth/server';
import { getDb } from '@/lib/db/client';
import { NotFoundError } from '@/lib/db/errors';
import { loadEvent } from '@/lib/db/events';
import { eventPdf } from '@/lib/event/pdf';

/** The organizer's printable sheet — full names, for the scorer's table. */
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await currentUser();
  if (!user) return new Response('Sign in first.', { status: 401 });
  try {
    const event = await loadEvent(await getDb(), actorOf(user), id);
    const bytes = await eventPdf(event, new Date().toISOString());
    return new Response(Buffer.from(bytes), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="${event.competition.slug}.pdf"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    if (error instanceof NotFoundError) return new Response('Not found.', { status: 404 });
    throw error;
  }
}
