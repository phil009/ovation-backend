import { Injectable } from '@nestjs/common';
import ExcelJS from 'exceljs';
import { PrismaService } from '../../prisma/prisma.service.js';
import { DonationStatus, PaymentMode } from '../../generated/prisma/enums.js';
import { EventsService } from '../events/events.service.js';

/**
 * Excel export in the layout the client asked for (one sheet, "Donations"):
 *
 *   awardee row (highlighted)    number + name, their own donation, payment note
 *   supporter rows               name, amount, payment note, check flag + notes for doubtful entries
 *   one empty row                room to add a supporter by hand: the formulas already include it
 *   Total row (bold)             supporters total and awardee + supporters, as formulas
 *   ... next awardee ...
 *   General donations            gifts "for all awardees", with their total
 *   Grand totals                 awardee donations, all supporters, general, everything
 *
 * Amounts are naira (kobo / 100). Totals are real Excel formulas, with their values pre-filled
 * so the sheet also shows numbers in viewers that don't recalculate.
 */

const COLUMNS = [
  { header: 'Awardee', key: 'awardee', width: 32 },
  { header: 'Donation (₦)', key: 'donation', width: 16 },
  { header: 'Payment note', key: 'payNote', width: 16 },
  { header: 'Supporter', key: 'supporter', width: 32 },
  { header: 'Supporter amount (₦)', key: 'supAmount', width: 20 },
  { header: 'Supporter payment note', key: 'supNote', width: 22 },
  { header: 'Total (₦)', key: 'total', width: 18 },
  { header: 'Photo number', key: 'photo', width: 14 },
  { header: 'Check flag', key: 'check', width: 12 },
  { header: 'Notes', key: 'notes', width: 40 },
] as const;

const NAIRA = '#,##0.00';
const FILL = {
  awardee: 'FFFFF2CC', // light yellow
  check: 'FFFCE4D6',   // light orange: hard to read / needs review
  section: 'FFDDEBF7', // light blue
  header: 'FF1F3864',  // dark blue
};

const naira = (kobo: bigint) => Number(kobo) / 100;

const MODE_LABEL: Record<PaymentMode, string> = { CASH: 'Cash', TRANSFER: 'Transfer', PLEDGE: 'Pledge' };

function paymentNote(mode: PaymentMode | null, status?: DonationStatus) {
  if (!mode) return '';
  const label = MODE_LABEL[mode];
  return status === DonationStatus.PLEDGED && mode !== PaymentMode.PLEDGE ? `${label} (pledged)` : label;
}

const fill = (argb: string): ExcelJS.Fill => ({ type: 'pattern', pattern: 'solid', fgColor: { argb } });

@Injectable()
export class ExportService {
  constructor(private prisma: PrismaService, private events: EventsService) {}

  async eventWorkbook(eventId: string) {
    const event = await this.events.get(eventId);
    const [awardees, donations] = await Promise.all([
      this.prisma.awardee.findMany({
        where: { eventId, deletedAt: null },
        orderBy: [{ number: { sort: 'asc', nulls: 'last' } }, { createdAt: 'asc' }],
      }),
      this.prisma.donation.findMany({ where: { eventId, deletedAt: null }, orderBy: { createdAt: 'asc' } }),
    ]);

    const wb = new ExcelJS.Workbook();
    wb.creator = 'Ovation';
    wb.created = new Date();
    const ws = wb.addWorksheet('Donations', { views: [{ state: 'frozen', ySplit: 3 }] });
    ws.columns = COLUMNS.map((c) => ({ key: c.key, width: c.width }));

    // Title, then the header row on row 3.
    ws.getCell('A1').value = `${event.name} (${event.date.toISOString().slice(0, 10)})`;
    ws.getCell('A1').font = { bold: true, size: 14 };
    ws.getCell('A2').value = `Exported ${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC${event.closed ? ' · event closed' : ''}`;
    ws.getCell('A2').font = { italic: true, color: { argb: 'FF666666' } };
    const header = ws.getRow(3);
    header.values = COLUMNS.map((c) => c.header);
    header.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    header.eachCell((cell) => { cell.fill = fill(FILL.header); });

    for (const key of ['donation', 'supAmount', 'total'] as const) ws.getColumn(key).numFmt = NAIRA;

    const byAwardee = new Map<string | null, typeof donations>();
    for (const d of donations) {
      const list = byAwardee.get(d.awardeeId) ?? [];
      list.push(d);
      byAwardee.set(d.awardeeId, list);
    }

    const addSupporterRow = (d: (typeof donations)[number]) => {
      const row = ws.addRow({
        supporter: d.donorName,
        supAmount: naira(d.amountKobo),
        supNote: paymentNote(d.paymentMode, d.status),
        check: d.needsReview ? 'CHECK' : '',
        notes: d.note ?? (d.needsReview ? 'Marked for review' : ''),
      });
      if (d.needsReview) row.eachCell({ includeEmpty: true }, (cell) => { cell.fill = fill(FILL.check); });
    };

    // ---- one block per awardee ----
    const sectionStart = ws.rowCount + 1;
    let awardeesKobo = 0n, supportersKobo = 0n, pledgedKobo = 0n;

    for (const a of awardees) {
      const list = byAwardee.get(a.id) ?? [];
      const supSum = list.reduce((s, d) => s + d.amountKobo, 0n);
      awardeesKobo += a.amountKobo;
      supportersKobo += supSum;
      pledgedKobo += list.filter((d) => d.status === DonationStatus.PLEDGED).reduce((s, d) => s + d.amountKobo, 0n);
      if (a.paymentMode === PaymentMode.PLEDGE) pledgedKobo += a.amountKobo;

      const awardeeRow = ws.addRow({
        awardee: a.number !== null ? `${a.number}. ${a.name}` : a.name,
        donation: naira(a.amountKobo),
        payNote: paymentNote(a.paymentMode),
      });
      awardeeRow.font = { bold: true };
      awardeeRow.eachCell({ includeEmpty: true }, (cell) => { cell.fill = fill(FILL.awardee); });

      const first = ws.rowCount + 1;
      list.forEach(addSupporterRow);
      ws.addRow({}); // empty row for adding a supporter by hand
      const last = ws.rowCount;

      const totalRow = ws.addRow({ awardee: `Total: ${a.name}` });
      const r = totalRow.number;
      totalRow.getCell('supAmount').value = { formula: `SUM(E${first}:E${last})`, result: naira(supSum) };
      totalRow.getCell('total').value = { formula: `B${awardeeRow.number}+E${r}`, result: naira(a.amountKobo + supSum) };
      totalRow.font = { bold: true };
      totalRow.eachCell({ includeEmpty: true }, (cell) => { cell.border = { top: { style: 'thin' } }; });
      ws.addRow({}); // spacer before the next awardee
    }
    const sectionEnd = Math.max(ws.rowCount, sectionStart);

    // ---- general donations ("for all awardees") ----
    const general = byAwardee.get(null) ?? [];
    const generalKobo = general.reduce((s, d) => s + d.amountKobo, 0n);
    pledgedKobo += general.filter((d) => d.status === DonationStatus.PLEDGED).reduce((s, d) => s + d.amountKobo, 0n);

    const genHeader = ws.addRow({ awardee: 'General donations (for all awardees)' });
    genHeader.font = { bold: true };
    genHeader.eachCell({ includeEmpty: true }, (cell) => { cell.fill = fill(FILL.section); });
    const gFirst = ws.rowCount + 1;
    general.forEach(addSupporterRow);
    ws.addRow({});
    const gLast = ws.rowCount;
    const genTotal = ws.addRow({ awardee: 'Total: general donations' });
    genTotal.getCell('total').value = { formula: `SUM(E${gFirst}:E${gLast})`, result: naira(generalKobo) };
    genTotal.font = { bold: true };
    ws.addRow({});

    // ---- grand totals ----
    const totalsHeader = ws.addRow({ awardee: 'Grand totals' });
    totalsHeader.font = { bold: true };
    totalsHeader.eachCell({ includeEmpty: true }, (cell) => { cell.fill = fill(FILL.section); });

    const rng = (col: string) => `${col}${sectionStart}:${col}${sectionEnd}`;
    const line = (label: string, formula: string, result: bigint) => {
      const row = ws.addRow({ awardee: label });
      row.getCell('total').value = { formula, result: naira(result) };
      return row.number;
    };
    const rAwardees = line('Awardee donations', `SUM(${rng('B')})`, awardeesKobo);
    const rSupporters = line('All supporters', `SUMIF(${rng('A')},"Total:*",${rng('E')})`, supportersKobo);
    const rGeneral = line('General donations', `G${genTotal.number}`, generalKobo);
    const grand = awardeesKobo + supportersKobo + generalKobo;
    const rAll = line('Everything', `G${rAwardees}+G${rSupporters}+G${rGeneral}`, grand);
    ws.getRow(rAll).font = { bold: true };
    ws.getRow(rAll).getCell('total').border = { top: { style: 'thin' }, bottom: { style: 'double' } };

    // Pledged vs received comes from the data as it was exported (a value, not a formula).
    const pledgedRow = ws.addRow({ awardee: 'Of which still pledged', total: naira(pledgedKobo) });
    pledgedRow.font = { italic: true };
    const receivedRow = ws.addRow({ awardee: 'Of which received', total: naira(grand - pledgedKobo) });
    receivedRow.font = { italic: true };

    const buffer = Buffer.from(await wb.xlsx.writeBuffer());
    const slug = event.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'event';
    return { buffer, filename: `${slug}-${event.date.toISOString().slice(0, 10)}.xlsx` };
  }
}
