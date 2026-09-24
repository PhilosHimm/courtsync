import type { PDFFont, PDFPage } from 'pdf-lib';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import { instantToWallClock, venueClockLabel } from '@/lib/core';
import { bracketStages, sideText } from './bracket-stages';
import { leagueTable, namesOf, playoffMatchesOf, poolTables } from './engine';
import type { EventSnapshot } from './snapshot';
import { scheduleRows } from './views';

/**
 * The sheet taped to the gym wall (#31): the schedule, the tables and the
 * bracket as a PDF, generated from the event rather than screenshotted.
 *
 * Pure apart from the bytes it returns: the document's dates are the
 * `generatedAt` passed in, never the clock, so the same event and time give
 * the same file.
 *
 * The standard PDF fonts cover the Windows-1252 character set only. A name
 * outside it is folded — accents dropped, anything else shown as "?" —
 * rather than failing the whole sheet. Embedding a font that covers every
 * script is the fix if that turns out to matter to a real organizer.
 */

const A4 = { width: 595.28, height: 841.89 };
const MARGIN = 40;
const LINE = 14;

/** What Helvetica can draw. */
export function pdfSafe(text: string): string {
  return text
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, '-')
    .replace(/[^\x20-\x7e\xa0-\xff]/g, '?');
}

class Writer {
  page!: PDFPage;
  y = 0;
  constructor(
    private readonly doc: PDFDocument,
    private readonly font: PDFFont,
    private readonly bold: PDFFont,
    private readonly footer: string,
  ) {
    this.newPage();
  }
  newPage() {
    this.page = this.doc.addPage([A4.width, A4.height]);
    this.y = A4.height - MARGIN;
    this.page.drawText(pdfSafe(this.footer), {
      x: MARGIN,
      y: 20,
      size: 8,
      font: this.font,
      color: rgb(0.3, 0.3, 0.3),
    });
  }
  ensure(lines: number) {
    if (this.y - lines * LINE < MARGIN + 10) this.newPage();
  }
  text(value: string, opts: { size?: number; bold?: boolean; x?: number } = {}) {
    const size = opts.size ?? 10;
    this.page.drawText(pdfSafe(value), {
      x: opts.x ?? MARGIN,
      y: this.y - size,
      size,
      font: opts.bold ? this.bold : this.font,
      color: rgb(0.11, 0.11, 0.12),
    });
  }
  line(value: string, opts: { size?: number; bold?: boolean } = {}) {
    this.ensure(1);
    this.text(value, opts);
    this.y -= (opts.size ?? 10) + 4;
  }
  row(cells: Array<[number, string]>, opts: { bold?: boolean } = {}) {
    this.ensure(1);
    for (const [x, value] of cells) this.text(value, { x: MARGIN + x, ...opts });
    this.y -= LINE;
  }
  gap(n = 1) {
    this.y -= LINE * n;
  }
}

export async function eventPdf(event: EventSnapshot, generatedAt: string): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const zone = event.competition.timeZone ?? 'UTC';
  const stamp = new Date(generatedAt);
  doc.setTitle(pdfSafe(event.competition.name));
  doc.setCreator('CourtSync');
  doc.setProducer('CourtSync');
  doc.setCreationDate(stamp);
  doc.setModificationDate(stamp);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const printed = instantToWallClock(generatedAt, zone);
  const w = new Writer(
    doc,
    font,
    bold,
    `${event.competition.name} - printed ${printed.date} ${printed.clock} - scores may have changed since`,
  );

  w.line(event.competition.name, { size: 18, bold: true });
  if (event.venue) w.line(event.venue.name);
  w.gap();

  const names = namesOf(event);
  const rows = scheduleRows({
    matches: event.matches,
    timeslots: event.timeslots,
    courts: event.courts,
    names,
  });
  for (const session of event.sessions) {
    const day = rows.filter((r) => r.sessionId === session.id);
    if (day.length === 0) continue;
    w.ensure(4);
    w.line(`${session.name ?? session.playDate}${session.cancelledAt ? ' - CANCELLED' : ''}`, {
      size: 13,
      bold: true,
    });
    w.row(
      [
        [0, 'Time'],
        [55, 'Court'],
        [130, 'Match'],
        [380, 'Ref'],
        [460, 'Score'],
      ],
      { bold: true },
    );
    for (const r of day) {
      w.row([
        [0, r.startAt ? venueClockLabel(r.startAt, zone) : '-'],
        [55, (r.court ?? '-').slice(0, 14)],
        [130, `${r.home} v ${r.away}`.slice(0, 48)],
        [380, (r.referee ?? '').slice(0, 16)],
        [460, r.score ?? ''],
      ]);
    }
    w.gap();
  }

  const tables =
    event.competition.format === 'league'
      ? [{ title: 'Standings', rows: leagueTable(event) }]
      : event.competition.format === 'tournament'
        ? event.pools.map((p) => ({ title: `Pool ${p.name}`, rows: poolTables(event)[p.id] ?? [] }))
        : [];
  for (const table of tables) {
    w.ensure(3 + table.rows.length);
    w.line(table.title, { size: 13, bold: true });
    w.row(
      [
        [0, '#'],
        [20, 'Team'],
        [260, 'W-L'],
        [310, 'Sets'],
        [370, 'Points'],
      ],
      { bold: true },
    );
    for (const s of table.rows) {
      w.row([
        [0, String(s.rank)],
        [20, s.participantName.slice(0, 40)],
        [260, `${s.wins}-${s.losses}`],
        [310, `${s.setsWon}-${s.setsLost}`],
        [370, s.pointDifferential > 0 ? `+${s.pointDifferential}` : String(s.pointDifferential)],
      ]);
    }
    w.gap();
  }

  const playoff = playoffMatchesOf(event);
  for (const tier of [...new Set(playoff.map((m) => m.bracket ?? ''))]) {
    w.ensure(4);
    w.line(`${tier.charAt(0).toUpperCase()}${tier.slice(1)} bracket`, { size: 13, bold: true });
    for (const stage of bracketStages({
      competitionSlug: event.competition.slug,
      tier,
      matches: playoff,
      names,
    })) {
      w.line(stage.label, { bold: true });
      for (const m of stage.matches) {
        w.line(
          `${m.title}: ${sideText(m.home)} v ${sideText(m.away)}${m.score ? `  (${m.score})` : ''} - ${m.statusText}`,
        );
      }
    }
    w.gap();
  }

  return doc.save({ useObjectStreams: false });
}
