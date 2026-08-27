import type { Metadata } from 'next';
import { Big_Shoulders, IBM_Plex_Mono, IBM_Plex_Sans } from 'next/font/google';
import { SiteFooter } from '@/components/SiteFooter';
import { SiteHeader } from '@/components/SiteHeader';
import './globals.css';

// Condensed, athletic, numeral-forward — the scoreboard and jersey-number
// character this identity is built around. Used with restraint: headlines
// and the CourtSync mark only.
const bigShoulders = Big_Shoulders({
  subsets: ['latin'],
  weight: ['700', '800'],
  variable: '--font-big-shoulders',
});

const plexSans = IBM_Plex_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-plex-sans',
});

const plexMono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-plex-mono',
});

export const metadata: Metadata = {
  title: 'CourtSync — schedule volleyball, three ways',
  description:
    'Open-source scheduling and scoring for tournament organizers, league conveners, and drop-in hosts. Free, forever.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`${bigShoulders.variable} ${plexSans.variable} ${plexMono.variable}`}
    >
      <body className="flex min-h-screen flex-col">
        <SiteHeader />
        <main className="flex-1">{children}</main>
        <SiteFooter />
      </body>
    </html>
  );
}
