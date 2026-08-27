import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { SiteFooter } from '@/components/SiteFooter';
import { SiteHeader } from '@/components/SiteHeader';
import './globals.css';

/**
 * SF Pro is Apple's and cannot be licensed off-platform. The font stacks in
 * globals.css put `-apple-system` first, so an Apple device resolves the real
 * face and never downloads this; everyone else gets Inter, which is the
 * closest open-source equivalent. The `ss03` feature and the tracking and
 * leading corrections that make Inter sit in SF Pro's place are applied in
 * globals.css.
 */
const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'CourtSync — schedule volleyball, three ways',
  description:
    'Open-source scheduling and scoring for tournament organizers, league conveners, and drop-in hosts. Free, forever.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="flex min-h-screen flex-col bg-canvas">
        <SiteHeader />
        <main className="flex-1">{children}</main>
        <SiteFooter />
      </body>
    </html>
  );
}
