/**
 * A person's name as a public page may show it: first name plus last initial.
 *
 * An indexable page tied to full names, saying where a named person will be
 * at a specific time and place, is a stalking vector for a recreational
 * drop-in — the PRD's own §20 risk row, and the research report's note on
 * privacy controls for minors. So the reduction runs on the server, before
 * anything is rendered or serialized: the full name must never reach a public
 * page's HTML or JSON payload, only this.
 *
 * Only ever called with a PERSON's name. Team names are not personal data and
 * are shown as entered; the caller decides which it is holding.
 *
 * The last word is the surname and every middle word is dropped — a middle
 * name identifies somebody exactly as well as a surname does. The initial is
 * taken by grapheme, so an accented or non-Latin letter, or an emoji someone
 * typed into a sign-up form, is never cut in half.
 */
export function publicName(fullName: string): string {
  const words = fullName.trim().split(/\s+/).filter(Boolean);
  const first = words[0];
  if (first === undefined) return '';
  const last = words.length > 1 ? words[words.length - 1] : undefined;
  if (last === undefined) return first;
  return `${first} ${firstGrapheme(last)}.`;
}

const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });

function firstGrapheme(word: string): string {
  for (const { segment } of segmenter.segment(word)) return segment;
  return '';
}
