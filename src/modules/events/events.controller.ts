import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post } from "@nestjs/common";
import { ApiBearerAuth, ApiCreatedResponse, ApiOkResponse, ApiTags } from "@nestjs/swagger";
import { EventsService } from "./events.service.js";
import { EventDto } from "./dto/event.dto.js";
import { CreateEventDto } from "./dto/create-event.dto.js";
import { Role } from "../../generated/prisma/enums.js";
import { Roles } from "../../common/decorators/roles.decorator.js";
import { CurrentUser } from "../../common/decorators/current-user.decorator.js";

type AuthUser = { id: string };

@ApiTags('events')
@ApiBearerAuth()
@Controller('events')
export class EventsController {
    constructor(private events: EventsService) { }

    @Get() @ApiOkResponse({ type: EventDto, isArray: true })
    list() { return this.events.list(); }

    @Get(':id') @ApiOkResponse({ type: EventDto })
    get(@Param('id', ParseUUIDPipe) id: string) { return this.events.get(id); }

    @Roles(Role.ADMIN, Role.EDITOR) @Post() @ApiCreatedResponse({ type: EventDto })
    create(@Body() dto: CreateEventDto, @CurrentUser() user: AuthUser) { return this.events.create(dto, user.id); }

    @Roles(Role.ADMIN) @Patch(':id/close') @ApiOkResponse({ type: EventDto })
    close(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) { return this.events.setClosed(id, true, user.id); }

    @Roles(Role.ADMIN) @Patch(':id/reopen') @ApiOkResponse({ type: EventDto })
    reopen(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) { return this.events.setClosed(id, false, user.id); }
}
