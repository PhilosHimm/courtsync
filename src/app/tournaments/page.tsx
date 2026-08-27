import type { Metadata } from 'next';
import { PersonaAreaPage } from '@/components/PersonaAreaPage';
import { getPersona } from '@/lib/personas';

export const metadata: Metadata = {
  title: 'Tournament organizer — CourtSync',
  description:
    'Run a one-day volleyball tournament: pool play into a bracket, without the spreadsheet.',
};

export default function TournamentsPage() {
  return <PersonaAreaPage persona={getPersona('tournament')} />;
}
