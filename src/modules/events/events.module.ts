import { Module } from "@nestjs/common";
import { EventsController } from "./events.controller.js";
import { EventsService } from "./events.service.js";

@Module({
    controllers: [EventsController],
    providers: [EventsService],
    exports: [EventsService], // awardees and donations use assertOpen()
})
export class EventsModule { }
