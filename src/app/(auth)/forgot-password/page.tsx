import type { Metadata } from 'next';
import { ForgotForm } from '../AuthForms';
import { AuthShell } from '../AuthShell';

export const metadata: Metadata = {
  title: 'Reset your password — CourtSync',
  robots: { index: false },
};

export default function ForgotPage() {
  return (
    <AuthShell title="Reset your password" lead="We will email you a link to choose a new one.">
      <ForgotForm />
    </AuthShell>
  );
}
