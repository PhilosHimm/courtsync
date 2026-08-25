import type { Metadata } from 'next';
import { PersonaAreaPage } from '@/components/PersonaAreaPage';
import { getPersona } from '@/lib/personas';

export const metadata: Metadata = {
  title: 'League convener — CourtSync',
  description:
    'Run a volleyball league season: fixtures that survive rescheduling, standings that stay correct.',
};

export default function LeaguesPage() {
  return <PersonaAreaPage persona={getPersona('league')} />;
}
