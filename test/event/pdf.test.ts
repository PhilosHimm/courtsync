/**
 * The printable sheet (#31): a real PDF, deterministic for a given event and
 * time, and never failing on a name the standard fonts cannot draw.
 */

import { PDFDocument } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import { planPoolDraw, planPoolPlay } from '@/lib/event/engine';
import { eventPdf, pdfSafe } from '@/lib/event/pdf';
import { snapshotOf } from './snapshot-fixture';

function scheduled() {
  const base = snapshotOf();
  const pools = planPoolDraw(base).pools.map((p, i) => ({ ...p, id: `p${i}` }));
  const withPools = { ...base, pools };
  return { ...withPools, matches: planPoolPlay(withPools).matches };
}

describe('eventPdf', () => {
  it('produces a PDF with the event in it', async () => {
    const bytes = await eventPdf(scheduled(), '2026-07-04T12:00:00.000Z');
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe('%PDF-');
    const doc = await PDFDocument.load(bytes);
    expect(doc.getTitle()).toBe('Spring Open');
    expect(doc.getPageCount()).toBeGreaterThanOrEqual(1);
  });

  it('gives the same bytes for the same event at the same time', async () => {
    const event = scheduled();
    const a = await eventPdf(event, '2026-07-04T12:00:00.000Z');
    const b = await eventPdf(event, '2026-07-04T12:00:00.000Z');
    expect(Buffer.from(a).equals(Buffer.from(b))).toBe(true);
  });

  it('does not fail on names outside the standard font', async () => {
    const event = scheduled();
    event.participants[0] = { ...event.participants[0]!, name: 'Łódź Spikers 🏐 排球' };
    await expect(eventPdf(event, '2026-07-04T12:00:00.000Z')).resolves.toBeInstanceOf(Uint8Array);
  });
});

describe('pdfSafe', () => {
  it('folds accents and replaces what cannot be drawn', () => {
    expect(pdfSafe('Zoë — Été')).toBe('Zoe - Ete');
    expect(pdfSafe('排球')).toBe('??');
  });
});
