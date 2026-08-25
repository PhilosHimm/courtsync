import type { Metadata } from 'next';
import { PersonaAreaPage } from '@/components/PersonaAreaPage';
import { getPersona } from '@/lib/personas';

export const metadata: Metadata = {
  title: 'Drop-in host — CourtSync',
  description: 'Run a recurring volleyball drop-in: capacity, waitlist, attendance, fair rotation.',
};

export default function DropInsPage() {
  return <PersonaAreaPage persona={getPersona('dropin')} />;
}
