/**
 * @vitest-environment jsdom
 *
 * Accessibility baseline for the components that are already on screen.
 *
 * PRODUCT.md commits to keyboard navigation, semantic structure, labelled
 * controls, and status never carried by colour alone — verified rather than
 * asserted. This is that verification: axe over each rendered component, plus
 * the handful of checks axe cannot make because they are about meaning rather
 * than markup.
 *
 * Deliberately NOT a WCAG 2.2 AA conformance claim. axe catches roughly a
 * third of real issues, and claiming conformance nothing has audited is the
 * same dishonesty as overstating a test count.
 */

import { render } from '@testing-library/react';
import axe from 'axe-core';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({ usePathname: () => '/tournaments' }));
vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

import { PersonaCard } from '@/components/PersonaCard';
import { SiteFooter } from '@/components/SiteFooter';
import { SiteHeader } from '@/components/SiteHeader';
import { getPersona } from '@/lib/personas';

afterEach(() => {
  document.body.innerHTML = '';
});

/** Run axe over a container and return violations, most serious first. */
async function violationsIn(container: HTMLElement): Promise<axe.Result[]> {
  const results = await axe.run(container, {
    // Rules that need a whole page rather than a fragment would fire on every
    // component and say nothing useful about the component.
    rules: {
      region: { enabled: false },
      'page-has-heading-one': { enabled: false },
      'landmark-one-main': { enabled: false },
    },
  });
  return results.violations;
}

const describeViolations = (violations: axe.Result[]): string =>
  violations.map((v) => `${v.id} (${v.impact}): ${v.help}`).join('\n');

describe('rendered components pass axe', () => {
  it('SiteHeader', async () => {
    const { container } = render(<SiteHeader />);
    const violations = await violationsIn(container);
    expect(describeViolations(violations)).toBe('');
  });

  it('SiteFooter', async () => {
    const { container } = render(<SiteFooter />);
    expect(describeViolations(await violationsIn(container))).toBe('');
  });

  it('PersonaCard', async () => {
    const { container } = render(<PersonaCard persona={getPersona('tournament')} />);
    expect(describeViolations(await violationsIn(container))).toBe('');
  });
});

describe('things axe cannot check, because they are about meaning', () => {
  it('the primary navigation has an accessible name', async () => {
    // A screen reader announces "navigation" for every nav on the page. With
    // more than one, an unnamed landmark is a list the user cannot tell apart
    // from the next one.
    const { container } = render(<SiteHeader />);
    const navs = container.querySelectorAll('nav');
    expect(navs.length).toBeGreaterThan(0);
    for (const nav of navs) {
      const name = nav.getAttribute('aria-label') ?? nav.getAttribute('aria-labelledby');
      expect(name, 'every nav landmark needs a name').toBeTruthy();
    }
  });

  it('the current page is marked, not merely coloured', async () => {
    // PRODUCT.md: status is never carried by colour alone. Which nav item is
    // current is status, and a lighter grey says nothing to a screen reader
    // or to somebody who cannot distinguish the two greys.
    const { container } = render(<SiteHeader />);
    const current = container.querySelectorAll('[aria-current="page"]');
    expect(current).toHaveLength(1);
    expect(current[0]?.getAttribute('href')).toBe('/tournaments');
  });

  it('offers a skip link before the navigation', async () => {
    // The drop-in host is one-handed on a phone; a keyboard user is five tab
    // stops from the content on every page. The skip link is the fix and it
    // has to come first in the DOM to be reachable.
    const { container } = render(<SiteHeader />);
    const first = container.querySelector('a');
    expect(first?.getAttribute('href')).toBe('#main');
    expect(first?.textContent?.toLowerCase()).toContain('skip');
  });

  it('a link that opens somewhere else says so', async () => {
    // "Source" leaving the site is fine; leaving without warning is what
    // makes a back button stop working for somebody who did not see it.
    const { container } = render(<SiteHeader />);
    for (const anchor of container.querySelectorAll('a[target="_blank"]')) {
      expect(anchor.getAttribute('rel') ?? '').toContain('noopener');
      const label = anchor.getAttribute('aria-label') ?? anchor.textContent ?? '';
      expect(label.toLowerCase()).toMatch(/new tab|new window|opens/);
    }
  });
});
