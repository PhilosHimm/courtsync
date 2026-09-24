import type { Metadata } from 'next';
import { SignUpForm } from '../AuthForms';
import { AuthShell } from '../AuthShell';

export const metadata: Metadata = {
  title: 'Create an account — CourtSync',
  robots: { index: false },
};

export default async function SignUpPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next = '/events' } = await searchParams;
  return (
    <AuthShell
      title="Create an account"
      lead="Free, and it stays free. An account runs your events or keeps track of your own games — it does not build a profile."
    >
      <SignUpForm next={next} />
    </AuthShell>
  );
}
