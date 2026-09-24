import { describe, expect, it } from 'vitest';
import { dayOf, routePattern } from '@/lib/event/analytics';

describe('routePattern', () => {
  it('reduces a path with an id or a token to its route, so neither is ever stored', () => {
    expect(routePattern('/e/3f1c2b7e-0000-4000-8000-000000000001/schedule?team=spikers')).toBe(
      '/e/[id]',
    );
    expect(routePattern('/score/abcDEF123_-xyz')).toBe('/score/[token]');
    expect(routePattern('/unsubscribe/tok')).toBe('/unsubscribe/[token]');
  });

  it('keeps a known static route and ignores anything else', () => {
    expect(routePattern('/demo/tournament/')).toBe('/demo/tournament');
    expect(routePattern('/wp-admin.php')).toBeNull();
  });
});

describe('dayOf', () => {
  it('keeps the day and nothing finer', () => {
    expect(dayOf('2026-05-02T23:59:59.999Z')).toBe('2026-05-02');
  });
});
