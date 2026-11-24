import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module.js";
import { EventsController } from "./events.controller.js";
import { EventsService } from "./events.service.js";

@Module({
    imports: [AuditModule],
    controllers: [EventsController],
    providers: [EventsService],
    exports: [EventsService], // awardees and donations use assertOpen()
})
export class EventsModule { }
