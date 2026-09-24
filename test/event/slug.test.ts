import { describe, expect, it } from 'vitest';
import { slugify, uniqueSlug } from '@/lib/event/slug';

describe('slugify', () => {
  it('lowercases, hyphenates and trims', () => {
    expect(slugify('  Spring Open 2026! ')).toBe('spring-open-2026');
  });
  it('folds accents rather than dropping letters', () => {
    expect(slugify('Été Classique')).toBe('ete-classique');
  });
  it('never returns an empty slug', () => {
    expect(slugify('!!!')).toBe('event');
  });
  it('caps length without leaving a trailing hyphen', () => {
    const slug = slugify(`${'a'.repeat(47)} b`);
    expect(slug.length).toBeLessThanOrEqual(48);
    expect(slug.endsWith('-')).toBe(false);
  });
});

describe('uniqueSlug', () => {
  it('numbers a repeat rather than colliding', () => {
    expect(uniqueSlug('Spring Open', new Set())).toBe('spring-open');
    expect(uniqueSlug('Spring Open', new Set(['spring-open', 'spring-open-2']))).toBe(
      'spring-open-3',
    );
  });
});
