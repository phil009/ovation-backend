import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { EventsService } from '../events/events.service.js';
import { toKobo } from '../../common/money.js';
import { CreateAwardeeDto } from './dto/create-awardee.dto.js';
import { UpdateAwardeeDto } from './dto/update-awardee.dto.js';

// Fields returned to clients (hides deletedAt).
const select = {
  id: true, eventId: true, number: true, name: true,
  amountKobo: true, paymentMode: true, createdAt: true,
} as const;

@Injectable()
export class AwardeesService {
  constructor(private prisma: PrismaService, private events: EventsService) {}

  async list(eventId: string) {
    await this.events.get(eventId);
    return this.prisma.awardee.findMany({
      where: { eventId, deletedAt: null },
      orderBy: [{ number: { sort: 'asc', nulls: 'last' } }, { createdAt: 'asc' }],
      select,
    });
  }

  async create(eventId: string, dto: CreateAwardeeDto) {
    await this.events.assertOpen(eventId);
    return this.prisma.awardee.create({
      data: {
        eventId,
        number: dto.number,
        name: dto.name.trim(),
        amountKobo: dto.amountKobo !== undefined ? toKobo(dto.amountKobo) : undefined,
        paymentMode: dto.paymentMode,
      },
      select,
    });
  }

  async update(eventId: string, id: string, dto: UpdateAwardeeDto) {
    await this.events.assertOpen(eventId);
    await this.findLive(eventId, id);
    return this.prisma.awardee.update({
      where: { id },
      data: {
        number: dto.number,
        name: dto.name?.trim(),
        amountKobo: dto.amountKobo !== undefined ? toKobo(dto.amountKobo) : undefined,
        paymentMode: dto.paymentMode,
      },
      select,
    });
  }

  /** Soft delete. Blocked while live donations point at this awardee, so totals never lose money silently. */
  async remove(eventId: string, id: string) {
    await this.events.assertOpen(eventId);
    await this.findLive(eventId, id);
    const donations = await this.prisma.donation.count({ where: { awardeeId: id, deletedAt: null } });
    if (donations > 0) {
      throw new ConflictException(`This awardee still has ${donations} donation(s); move or delete them first`);
    }
    await this.prisma.awardee.update({ where: { id }, data: { deletedAt: new Date() } });
  }

  /** Used by donations: the awardee must exist, be live and belong to the event. */
  async findLive(eventId: string, id: string) {
    const awardee = await this.prisma.awardee.findFirst({ where: { id, eventId, deletedAt: null }, select });
    if (!awardee) throw new NotFoundException('Awardee not found in this event');
    return awardee;
  }
}
