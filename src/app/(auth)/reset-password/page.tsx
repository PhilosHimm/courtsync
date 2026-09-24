import type { Metadata } from 'next';
import { ResetForm } from '../AuthForms';
import { AuthShell } from '../AuthShell';

export const metadata: Metadata = {
  title: 'Choose a new password — CourtSync',
  robots: { index: false },
};

export default async function ResetPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token = '' } = await searchParams;
  return (
    <AuthShell title="Choose a new password">
      {token ? (
        <ResetForm token={token} />
      ) : (
        <p className="text-body">This reset link is incomplete. Ask for a new one.</p>
      )}
    </AuthShell>
  );
}
