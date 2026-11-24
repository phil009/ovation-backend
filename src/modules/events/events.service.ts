import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service.js";
import { CreateEventDto } from "./dto/create-event.dto.js";

@Injectable()
export class EventsService {
    constructor(private prisma: PrismaService) { }
    
    create(dto: CreateEventDto) {
        return this.prisma.event.create({
            data: {
                name: dto.name.trim(),
                date: new Date(dto.date)
            }
        })
    }

    list() {
        return this.prisma.event.findMany({
            orderBy: {
                date: 'desc'
            }
        })
    }

    async get(id: string) {
        const event = await this.prisma.event.findUnique({ where: { id } });
        if (!event) throw new NotFoundException('Event not found');
        return event;
    }

    async setClosed(id: string, closed: boolean) {
        await this.get(id);
        return this.prisma.event.update({
            where: { id },
            data: { closed }
        });
    }

     /** Used by other modules: no writes are allowed on a closed event. */
    async assertOpen(id: string) {
        const event = await this.get(id);
        if (event.closed) throw new ConflictException('This event is closed');
        return event;
    }
}
