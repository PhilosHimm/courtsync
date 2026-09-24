import { neonAuth } from '@/lib/auth/server';

/**
 * Neon Auth's API, proxied. Resolved per request rather than at import so
 * that building the app needs no secrets.
 */
type Context = { params: Promise<{ path: string[] }> };

export const GET = (request: Request, context: Context) =>
  neonAuth().handler().GET(request, context);
export const POST = (request: Request, context: Context) =>
  neonAuth().handler().POST(request, context);
