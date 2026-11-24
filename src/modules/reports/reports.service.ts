import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { DonationStatus, PaymentMode } from '../../generated/prisma/enums.js';
import { EventsService } from '../events/events.service.js';
import { EventSummaryDto } from './dto/event-summary.dto.js';

type Bucket = { total: bigint; pledged: bigint; count: number };
const empty = (): Bucket => ({ total: 0n, pledged: 0n, count: 0 });

@Injectable()
export class ReportsService {
  constructor(private prisma: PrismaService, private events: EventsService) {}

  /** Totals are computed from the rows on every call, so they can never drift from the data. */
  async eventSummary(eventId: string): Promise<EventSummaryDto> {
    const event = await this.events.get(eventId);

    const [awardees, groups] = await Promise.all([
      this.prisma.awardee.findMany({
        where: { eventId, deletedAt: null },
        orderBy: [{ number: { sort: 'asc', nulls: 'last' } }, { createdAt: 'asc' }],
        select: { id: true, number: true, name: true, amountKobo: true, paymentMode: true },
      }),
      // One row per (awardee, status) with the sum and count, done by Postgres.
      this.prisma.donation.groupBy({
        by: ['awardeeId', 'status'],
        where: { eventId, deletedAt: null },
        _sum: { amountKobo: true },
        _count: { _all: true },
      }),
    ]);

    // Fold the groups into one bucket per awardee (key null = general donations).
    const buckets = new Map<string | null, Bucket>();
    for (const g of groups) {
      const b = buckets.get(g.awardeeId) ?? empty();
      const sum = g._sum.amountKobo ?? 0n;
      b.total += sum;
      b.count += g._count._all;
      if (g.status === DonationStatus.PLEDGED) b.pledged += sum;
      buckets.set(g.awardeeId, b);
    }

    let awardeesKobo = 0n, supportersKobo = 0n, pledgedKobo = 0n, donationCount = 0;

    const awardeeRows = awardees.map((a) => {
      const s = buckets.get(a.id) ?? empty();
      const ownPledged = a.paymentMode === PaymentMode.PLEDGE ? a.amountKobo : 0n;
      awardeesKobo += a.amountKobo;
      supportersKobo += s.total;
      pledgedKobo += s.pledged + ownPledged;
      donationCount += s.count;
      return {
        id: a.id,
        number: a.number,
        name: a.name,
        paymentMode: a.paymentMode,
        awardeeKobo: a.amountKobo.toString(),
        supportersKobo: s.total.toString(),
        supporterCount: s.count,
        pledgedKobo: (s.pledged + ownPledged).toString(),
        totalKobo: (a.amountKobo + s.total).toString(),
      };
    });

    const general = buckets.get(null) ?? empty();
    pledgedKobo += general.pledged;
    donationCount += general.count;
    const totalKobo = awardeesKobo + supportersKobo + general.total;

    return {
      event: { id: event.id, name: event.name, date: event.date, closed: event.closed },
      awardees: awardeeRows,
      general: {
        totalKobo: general.total.toString(),
        count: general.count,
        pledgedKobo: general.pledged.toString(),
      },
      totals: {
        awardeesKobo: awardeesKobo.toString(),
        supportersKobo: supportersKobo.toString(),
        generalKobo: general.total.toString(),
        totalKobo: totalKobo.toString(),
        pledgedKobo: pledgedKobo.toString(),
        receivedKobo: (totalKobo - pledgedKobo).toString(),
        donationCount,
      },
    };
  }
}
