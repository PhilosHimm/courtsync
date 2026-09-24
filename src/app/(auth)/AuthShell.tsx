import { Tile } from '@/components/Tile';

export function AuthShell({
  title,
  lead,
  children,
}: {
  title: string;
  lead?: string;
  children: React.ReactNode;
}) {
  return (
    <Tile surface="parchment">
      <div className="mx-auto max-w-md rounded-lg border border-hairline bg-canvas p-6 sm:p-8">
        <h1 className="text-display-md">{title}</h1>
        {lead && <p className="mt-1 text-body text-ink-muted-80">{lead}</p>}
        <div className="mt-6">{children}</div>
      </div>
    </Tile>
  );
}
