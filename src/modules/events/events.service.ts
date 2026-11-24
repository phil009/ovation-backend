import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service.js";
import { Prisma } from "../../generated/prisma/client.js";
import { lockRow } from "../../prisma/lock.js";
import { AuditService } from "../audit/audit.service.js";
import { CreateEventDto } from "./dto/create-event.dto.js";

// Access (which organisation, which role) is checked by OrgAccessGuard before these run.
@Injectable()
export class EventsService {
    constructor(private prisma: PrismaService, private audit: AuditService) { }

    create(organizationId: string, dto: CreateEventDto, userId: string) {
        return this.prisma.$transaction(async (tx) => {
            const event = await tx.event.create({
                data: { organizationId, name: dto.name.trim(), date: new Date(dto.date) },
            });
            await this.audit.record(tx, { userId, organizationId, action: 'CREATE', entity: 'Event', entityId: event.id, after: event });
            return event;
        });
    }

    list(organizationId: string) {
        return this.prisma.event.findMany({ where: { organizationId }, orderBy: { date: 'desc' } });
    }

    /** `db` lets callers run this inside their own transaction. */
    async get(id: string, db: Prisma.TransactionClient = this.prisma) {
        const event = await db.event.findUnique({ where: { id } });
        if (!event) throw new NotFoundException('Event not found');
        return event;
    }

    setClosed(id: string, closed: boolean, userId: string) {
        return this.prisma.$transaction(async (tx) => {
            await lockRow(tx, 'Event', id);
            const before = await this.get(id, tx);
            if (before.closed === closed) return before; // nothing changes, nothing to audit

            const after = await tx.event.update({ where: { id }, data: { closed } });
            await this.audit.record(tx, {
                userId, organizationId: before.organizationId, action: closed ? 'CLOSE' : 'REOPEN',
                entity: 'Event', entityId: id, before, after,
            });
            return after;
        });
    }

    /** Used by other modules: no writes are allowed on a closed event. Returns the event. */
    async assertOpen(id: string, db: Prisma.TransactionClient = this.prisma) {
        const event = await this.get(id, db);
        if (event.closed) throw new ConflictException('This event is closed');
        return event;
    }
}
