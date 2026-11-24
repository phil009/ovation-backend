import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { Awardee, Prisma } from '../../generated/prisma/client.js';
import { lockRow } from '../../prisma/lock.js';
import { EventsService } from '../events/events.service.js';
import { AuditService } from '../audit/audit.service.js';
import { toKobo } from '../../common/money.js';
import { CreateAwardeeDto } from './dto/create-awardee.dto.js';
import { UpdateAwardeeDto } from './dto/update-awardee.dto.js';

// Fields returned to clients (hides deletedAt).
const select = {
  id: true, eventId: true, number: true, name: true,
  amountKobo: true, paymentMode: true, createdAt: true,
} as const;

/** What the API returns: the full row (which the audit log keeps) without deletedAt. */
const toPublic = ({ deletedAt: _deletedAt, ...rest }: Awardee) => rest;

@Injectable()
export class AwardeesService {
  constructor(
    private prisma: PrismaService,
    private events: EventsService,
    private audit: AuditService,
  ) {}

  async list(eventId: string) {
    await this.events.get(eventId);
    return this.prisma.awardee.findMany({
      where: { eventId, deletedAt: null },
      orderBy: [{ number: { sort: 'asc', nulls: 'last' } }, { createdAt: 'asc' }],
      select,
    });
  }

  create(eventId: string, dto: CreateAwardeeDto, userId: string) {
    return this.prisma.$transaction(async (tx) => {
      const event = await this.events.assertOpen(eventId, tx);
      const after = await tx.awardee.create({
        data: {
          eventId,
          number: dto.number,
          name: dto.name.trim(),
          amountKobo: dto.amountKobo !== undefined ? toKobo(dto.amountKobo) : undefined,
          paymentMode: dto.paymentMode,
        },
      });
      await this.audit.record(tx, { userId, organizationId: event.organizationId, action: 'CREATE', entity: 'Awardee', entityId: after.id, after });
      return toPublic(after);
    });
  }

  update(eventId: string, id: string, dto: UpdateAwardeeDto, userId: string) {
    return this.prisma.$transaction(async (tx) => {
      await lockRow(tx, 'Awardee', id);
      const before = await this.findLiveRow(eventId, id, tx);
      const event = await this.events.assertOpen(eventId, tx);
      const after = await tx.awardee.update({
        where: { id },
        data: {
          number: dto.number,
          name: dto.name?.trim(),
          amountKobo: dto.amountKobo !== undefined ? toKobo(dto.amountKobo) : undefined,
          paymentMode: dto.paymentMode,
        },
      });
      await this.audit.record(tx, { userId, organizationId: event.organizationId, action: 'UPDATE', entity: 'Awardee', entityId: id, before, after });
      return toPublic(after);
    });
  }

  /** Soft delete. Blocked while live donations point at this awardee, so totals never lose money silently. */
  async remove(eventId: string, id: string, userId: string) {
    await this.prisma.$transaction(async (tx) => {
      await lockRow(tx, 'Awardee', id);
      const before = await this.findLiveRow(eventId, id, tx);
      const event = await this.events.assertOpen(eventId, tx);
      const donations = await tx.donation.count({ where: { awardeeId: id, deletedAt: null } });
      if (donations > 0) {
        throw new ConflictException(`This awardee still has ${donations} donation(s); move or delete them first`);
      }
      const after = await tx.awardee.update({ where: { id }, data: { deletedAt: new Date() } });
      await this.audit.record(tx, { userId, organizationId: event.organizationId, action: 'DELETE', entity: 'Awardee', entityId: id, before, after });
    });
  }

  /** Used by donations: the awardee must exist, be live and belong to the event. */
  async findLive(eventId: string, id: string, db: Prisma.TransactionClient = this.prisma) {
    return toPublic(await this.findLiveRow(eventId, id, db));
  }

  private async findLiveRow(eventId: string, id: string, db: Prisma.TransactionClient) {
    const awardee = await db.awardee.findFirst({ where: { id, eventId, deletedAt: null } });
    if (!awardee) throw new NotFoundException('Awardee not found in this event');
    return awardee;
  }
}
