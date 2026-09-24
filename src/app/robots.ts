import type { MetadataRoute } from 'next';

/**
 * Public event pages are meant to be found. Everything behind a sign-in, a
 * score link or an unsubscribe token is not — those pages also carry
 * noindex, and this says so again for crawlers that read robots first.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/events', '/me', '/score/', '/unsubscribe/', '/api/', '/sign-in', '/sign-up'],
      },
    ],
    sitemap: process.env.APP_URL
      ? `${process.env.APP_URL.replace(/\/+$/, '')}/sitemap.xml`
      : undefined,
  };
}
