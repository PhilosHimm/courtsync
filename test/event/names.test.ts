/**
 * Specification for the public-page name reduction (#23).
 *
 * An indexable page tied to full names, saying where a named person will be
 * at a specific time and place, is a stalking vector for a recreational
 * drop-in. So a person's name on a public page is first name plus last
 * initial, and the reduction happens on the server: the full name must never
 * reach the public page's HTML or JSON payload, only the short form.
 *
 * Team names are not personal data and are not reduced. That decision lives
 * where the function is called, not here — this function only ever sees a
 * person's name.
 */

import { describe, expect, it } from 'vitest';
import { publicName } from '@/lib/event/names';

describe('publicName', () => {
  it('reduces a first and last name to first name and last initial', () => {
    expect(publicName('Jordan Lee')).toBe('Jordan L.');
  });

  it('uses the last word as the surname and drops the middle ones', () => {
    // A middle name is exactly as identifying as a surname.
    expect(publicName('Mary Ann Smith')).toBe('Mary S.');
  });

  it('leaves a single name alone', () => {
    expect(publicName('Priya')).toBe('Priya');
  });

  it('collapses stray whitespace', () => {
    expect(publicName('  Sam   Rivera ')).toBe('Sam R.');
  });

  it('keeps a hyphenated first name whole and initials a hyphenated surname once', () => {
    expect(publicName('Jean-Luc Picard-Smith')).toBe('Jean-Luc P.');
  });

  it('initials a surname that starts with a non-Latin letter', () => {
    expect(publicName('Zoë Øvergaard')).toBe('Zoë Ø.');
    expect(publicName('Ana Łukasz')).toBe('Ana Ł.');
  });

  it('initials by grapheme, never splitting a character in two', () => {
    // An emoji or a combining mark is several code units; slicing one off
    // would put half a character on a public page.
    const reduced = publicName('Kai ́Nguyen');
    expect(reduced.startsWith('Kai ')).toBe(true);
    expect(reduced.endsWith('.')).toBe(true);
    expect(publicName('Kai 👍🏽Ramos')).toBe('Kai 👍🏽.');
  });

  it('never returns any part of the surname beyond its initial', () => {
    for (const name of ['Alex Johnson', 'Mei Chen', 'Oluwaseun Adeyemi', 'Li Na Wu']) {
      const surname = name.split(' ').at(-1)!;
      expect(publicName(name)).not.toContain(surname.slice(1));
    }
  });

  it('returns an empty string for an empty name rather than a stray full stop', () => {
    expect(publicName('')).toBe('');
    expect(publicName('   ')).toBe('');
  });
});
