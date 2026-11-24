import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { Prisma } from '../../generated/prisma/client.js';
import { DonationStatus, PaymentMode } from '../../generated/prisma/enums.js';
import { EventsService } from '../events/events.service.js';
import { AwardeesService } from '../awardees/awardees.service.js';
import { toKobo } from '../../common/money.js';
import { CreateDonationDto } from './dto/create-donation.dto.js';
import { UpdateDonationDto } from './dto/update-donation.dto.js';
import { ListDonationsQuery } from './dto/list-donations.query.js';

// Fields returned to clients (hides deletedAt).
const select = {
  id: true, eventId: true, awardeeId: true, donorName: true, amountKobo: true,
  paymentMode: true, status: true, needsReview: true, note: true, version: true,
  createdById: true, createdAt: true, updatedAt: true,
} as const;

const defaultStatus = (mode: PaymentMode) =>
  mode === PaymentMode.PLEDGE ? DonationStatus.PLEDGED : DonationStatus.RECEIVED;

@Injectable()
export class DonationsService {
  constructor(
    private prisma: PrismaService,
    private events: EventsService,
    private awardees: AwardeesService,
  ) {}

  /** Idempotent: sending the same id twice returns the first donation instead of creating a second. */
  async create(dto: CreateDonationDto, userId: string) {
    const existing = await this.prisma.donation.findUnique({ where: { id: dto.id }, select });
    if (existing) return existing;

    await this.events.assertOpen(dto.eventId);
    if (dto.awardeeId) await this.awardees.findLive(dto.eventId, dto.awardeeId);

    try {
      return await this.prisma.donation.create({ data: this.toRow(dto, userId), select });
    } catch (e) {
      // Two identical requests raced each other: the other one won, so return its row.
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        return this.prisma.donation.findUniqueOrThrow({ where: { id: dto.id }, select });
      }
      throw e;
    }
  }

  /**
   * Saves up to 500 donations in one go. Ids that already exist are skipped and reported
   * as duplicates, so an offline client can resend its whole queue safely.
   */
  async createBatch(items: CreateDonationDto[], userId: string) {
    // Drop repeated ids inside the same batch (keep the first).
    const unique = [...new Map(items.map((d) => [d.id, d])).values()];

    // Every event must exist and be open.
    for (const eventId of new Set(unique.map((d) => d.eventId))) {
      await this.events.assertOpen(eventId);
    }

    // Every awardee must be live and belong to the event the donation names.
    const awardeeIds = [...new Set(unique.flatMap((d) => (d.awardeeId ? [d.awardeeId] : [])))];
    if (awardeeIds.length > 0) {
      const found = await this.prisma.awardee.findMany({
        where: { id: { in: awardeeIds }, deletedAt: null },
        select: { id: true, eventId: true },
      });
      const eventOf = new Map(found.map((a) => [a.id, a.eventId]));
      const bad = unique.filter((d) => d.awardeeId && eventOf.get(d.awardeeId) !== d.eventId);
      if (bad.length > 0) {
        throw new BadRequestException({
          message: 'Some donations name an awardee that is not in their event',
          ids: bad.map((d) => d.id),
        });
      }
    }

    // ON CONFLICT DO NOTHING: rows whose id already exists are skipped, never overwritten.
    const created = await this.prisma.donation.createManyAndReturn({
      data: unique.map((d) => this.toRow(d, userId)),
      skipDuplicates: true,
      select: { id: true },
    });
    const createdIds = new Set(created.map((c) => c.id));

    return {
      created: unique.filter((d) => createdIds.has(d.id)).map((d) => d.id),
      duplicates: unique.filter((d) => !createdIds.has(d.id)).map((d) => d.id),
    };
  }

  async list(q: ListDonationsQuery) {
    const where: Prisma.DonationWhereInput = { eventId: q.eventId, deletedAt: null };
    if (q.awardeeId) where.awardeeId = q.awardeeId;
    const [items, total] = await this.prisma.$transaction([
      this.prisma.donation.findMany({
        where,
        select,
        orderBy: { createdAt: 'asc' },
        take: q.limit ?? 100,
        skip: q.offset ?? 0,
      }),
      this.prisma.donation.count({ where }),
    ]);
    return { items, total };
  }

  async get(id: string) {
    const donation = await this.prisma.donation.findFirst({ where: { id, deletedAt: null }, select });
    if (!donation) throw new NotFoundException('Donation not found');
    return donation;
  }

  /**
   * Optimistic locking: the update only applies if the row is still at the version the client
   * read. If someone else saved first, the version has moved on and we answer 409.
   */
  async update(id: string, dto: UpdateDonationDto) {
    const current = await this.get(id);
    await this.events.assertOpen(current.eventId);
    if (dto.awardeeId) await this.awardees.findLive(current.eventId, dto.awardeeId);

    const result = await this.prisma.donation.updateMany({
      where: { id, version: dto.version, deletedAt: null },
      data: {
        awardeeId: dto.awardeeId, // undefined = unchanged, null = make it a general donation
        donorName: dto.donorName?.trim(),
        amountKobo: dto.amountKobo !== undefined ? toKobo(dto.amountKobo) : undefined,
        paymentMode: dto.paymentMode,
        status: dto.status,
        needsReview: dto.needsReview,
        note: dto.note,
        version: { increment: 1 },
      },
    });
    if (result.count === 0) {
      throw new ConflictException('This donation was changed by someone else. Reload it and try again.');
    }
    return this.get(id);
  }

  async remove(id: string) {
    const current = await this.get(id);
    await this.events.assertOpen(current.eventId);
    await this.prisma.donation.update({
      where: { id },
      data: { deletedAt: new Date(), version: { increment: 1 } },
    });
  }

  private toRow(d: CreateDonationDto, userId: string): Prisma.DonationCreateManyInput {
    return {
      id: d.id,
      eventId: d.eventId,
      awardeeId: d.awardeeId ?? null,
      donorName: d.donorName.trim(),
      amountKobo: toKobo(d.amountKobo),
      paymentMode: d.paymentMode,
      status: d.status ?? defaultStatus(d.paymentMode),
      needsReview: d.needsReview ?? false,
      note: d.note,
      createdById: userId,
    };
  }
}
