import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { Donation, Prisma } from '../../generated/prisma/client.js';
import { DonationStatus, PaymentMode } from '../../generated/prisma/enums.js';
import { lockRow } from '../../prisma/lock.js';
import { EventsService } from '../events/events.service.js';
import { AwardeesService } from '../awardees/awardees.service.js';
import { AuditService } from '../audit/audit.service.js';
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

/** What the API returns: the full row (which the audit log keeps) without deletedAt. */
const toPublic = ({ deletedAt: _deletedAt, ...rest }: Donation) => rest;

const defaultStatus = (mode: PaymentMode) =>
  mode === PaymentMode.PLEDGE ? DonationStatus.PLEDGED : DonationStatus.RECEIVED;

@Injectable()
export class DonationsService {
  constructor(
    private prisma: PrismaService,
    private events: EventsService,
    private awardees: AwardeesService,
    private audit: AuditService,
  ) {}

  /** Idempotent: sending the same id twice returns the first donation instead of creating a second. */
  create(dto: CreateDonationDto, userId: string) {
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.donation.findUnique({ where: { id: dto.id }, select });
      if (existing) return existing; // a replay: nothing changes, nothing to audit

      const event = await this.events.assertOpen(dto.eventId, tx);
      if (dto.awardeeId) await this.awardees.findLive(dto.eventId, dto.awardeeId, tx);

      // ON CONFLICT DO NOTHING: if an identical request won a race, we get no row back.
      const [after] = await tx.donation.createManyAndReturn({
        data: [this.toRow(dto, userId)],
        skipDuplicates: true,
      });
      if (!after) return tx.donation.findUniqueOrThrow({ where: { id: dto.id }, select });

      await this.audit.record(tx, { userId, organizationId: event.organizationId, action: 'CREATE', entity: 'Donation', entityId: after.id, after });
      return toPublic(after);
    });
  }

  /**
   * Saves up to 500 donations in one go. Ids that already exist are skipped and reported
   * as duplicates, so an offline client can resend its whole queue safely.
   * One audit row per donation actually created, in the same transaction.
   */
  createBatch(items: CreateDonationDto[], userId: string) {
    // Drop repeated ids inside the same batch (keep the first).
    const unique = [...new Map(items.map((d) => [d.id, d])).values()];

    return this.prisma.$transaction(async (tx) => {
      // Every event must exist and be open. Remember each event's organisation for the audit log.
      const orgOfEvent = new Map<string, string>();
      for (const eventId of new Set(unique.map((d) => d.eventId))) {
        const event = await this.events.assertOpen(eventId, tx);
        orgOfEvent.set(eventId, event.organizationId);
      }

      // Every awardee must be live and belong to the event the donation names.
      const awardeeIds = [...new Set(unique.flatMap((d) => (d.awardeeId ? [d.awardeeId] : [])))];
      if (awardeeIds.length > 0) {
        const found = await tx.awardee.findMany({
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
      const created = await tx.donation.createManyAndReturn({
        data: unique.map((d) => this.toRow(d, userId)),
        skipDuplicates: true,
      });
      await this.audit.recordMany(tx, created.map((after) => ({
        userId, organizationId: orgOfEvent.get(after.eventId)!, action: 'CREATE' as const,
        entity: 'Donation' as const, entityId: after.id, after,
      })));

      const createdIds = new Set(created.map((c) => c.id));
      return {
        created: unique.filter((d) => createdIds.has(d.id)).map((d) => d.id),
        duplicates: unique.filter((d) => !createdIds.has(d.id)).map((d) => d.id),
      };
    }, { timeout: 15_000 }); // 500 rows plus 500 audit rows: allow more than the 5 s default
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
  update(id: string, dto: UpdateDonationDto, userId: string) {
    return this.prisma.$transaction(async (tx) => {
      await lockRow(tx, 'Donation', id);
      const before = await this.findLiveRow(id, tx);
      const event = await this.events.assertOpen(before.eventId, tx);
      if (dto.awardeeId) await this.awardees.findLive(before.eventId, dto.awardeeId, tx);

      if (before.version !== dto.version) {
        throw new ConflictException('This donation was changed by someone else. Reload it and try again.');
      }
      const after = await tx.donation.update({
        where: { id },
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
      await this.audit.record(tx, { userId, organizationId: event.organizationId, action: 'UPDATE', entity: 'Donation', entityId: id, before, after });
      return toPublic(after);
    });
  }

  async remove(id: string, userId: string) {
    await this.prisma.$transaction(async (tx) => {
      await lockRow(tx, 'Donation', id);
      const before = await this.findLiveRow(id, tx);
      const event = await this.events.assertOpen(before.eventId, tx);
      const after = await tx.donation.update({
        where: { id },
        data: { deletedAt: new Date(), version: { increment: 1 } },
      });
      await this.audit.record(tx, { userId, organizationId: event.organizationId, action: 'DELETE', entity: 'Donation', entityId: id, before, after });
    });
  }

  private async findLiveRow(id: string, db: Prisma.TransactionClient) {
    const donation = await db.donation.findFirst({ where: { id, deletedAt: null } });
    if (!donation) throw new NotFoundException('Donation not found');
    return donation;
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
