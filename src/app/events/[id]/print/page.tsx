import { SectionTitle } from '@/components/app/ui';
import { organizerEvent } from '@/lib/app/session';

export default async function PrintPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { event } = await organizerEvent(id);
  const published = event.competition.status === 'published';
  return (
    <div className="flex flex-col gap-6">
      <SectionTitle>The sheet for the wall</SectionTitle>
      <p className="max-w-2xl text-body">
        The schedule, the tables and the bracket as a PDF, generated as of the moment you open it.
        Print it for the scorer’s table; reprint it after a correction.
      </p>
      <div className="flex flex-wrap gap-3">
        <a
          href={`/events/${id}/sheet.pdf`}
          className="inline-flex rounded-full bg-primary px-[22px] py-[11px] text-body text-on-dark"
        >
          Open the PDF (full names)
        </a>
        {published && (
          <a
            href={`/e/${id}/sheet.pdf`}
            className="inline-flex rounded-full border border-primary px-[22px] py-[11px] text-body text-primary"
          >
            Public version (first names and initials)
          </a>
        )}
      </div>
      <p className="text-caption text-ink-muted-80">
        The standard PDF fonts cannot draw every alphabet: a letter outside them prints without its
        accent, or as “?”.
      </p>
    </div>
  );
}
