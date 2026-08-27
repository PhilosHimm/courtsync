import Link from 'next/link';

/**
 * The one place the system deliberately goes dense. Everywhere else whitespace
 * is the product's pedestal; here the whole information architecture should be
 * visible at a glance, which is what the unusually relaxed 2.41 leading on the
 * link columns is for — it is what makes a dense column scannable rather than
 * a wall.
 */

const COLUMNS = [
  {
    heading: 'Areas',
    links: [
      { label: 'Tournaments', href: '/tournaments' },
      { label: 'Leagues', href: '/leagues' },
      { label: 'Drop-ins', href: '/dropins' },
    ],
  },
  {
    heading: 'The project',
    links: [
      { label: 'Source on GitHub', href: 'https://github.com/PhilosHimm/courtsync' },
      {
        label: 'What it is for',
        href: 'https://github.com/PhilosHimm/courtsync/blob/main/PRODUCT.md',
      },
      {
        label: 'What is out of scope',
        href: 'https://github.com/PhilosHimm/courtsync/blob/main/docs/SCOPE.md',
      },
    ],
  },
  {
    heading: 'How it is built',
    links: [
      {
        label: 'Architecture',
        href: 'https://github.com/PhilosHimm/courtsync/blob/main/docs/ARCHITECTURE.md',
      },
      {
        label: 'The data model',
        href: 'https://github.com/PhilosHimm/courtsync/blob/main/docs/DOMAIN.md',
      },
      {
        label: 'Open decisions',
        href: 'https://github.com/PhilosHimm/courtsync/blob/main/docs/DECISIONS.md',
      },
    ],
  },
] as const;

export function SiteFooter() {
  return (
    <footer className="bg-parchment text-ink-muted-80">
      <div className="mx-auto max-w-[1024px] px-6 py-16">
        <div className="grid gap-8 sm:grid-cols-3">
          {COLUMNS.map((column) => (
            <div key={column.heading}>
              <h2 className="text-caption-strong text-ink">{column.heading}</h2>
              <ul className="mt-1">
                {column.links.map((link) => (
                  <li key={link.label}>
                    {link.href.startsWith('http') ? (
                      <a href={link.href} className="text-dense-link text-ink-muted-80">
                        {link.label}
                      </a>
                    ) : (
                      <Link href={link.href} className="text-dense-link text-ink-muted-80">
                        {link.label}
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-12 border-t border-hairline pt-6">
          <p className="text-fine-print text-ink-muted-80">
            Pre-launch. No accounts, no data, nothing to sign up for yet.
          </p>
          <p className="mt-3 text-fine-print text-ink-muted-80">
            Apache-2.0. Free, with no revenue model and nothing to upsell.
          </p>
        </div>
      </div>
    </footer>
  );
}
