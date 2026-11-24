import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post } from "@nestjs/common";
import { ApiBearerAuth, ApiCreatedResponse, ApiOkResponse, ApiTags } from "@nestjs/swagger";
import { EventsService } from "./events.service.js";
import { EventDto } from "./dto/event.dto.js";
import { CreateEventDto } from "./dto/create-event.dto.js";
import { Role } from "../../generated/prisma/enums.js";
import { From, OrgAccess } from "../../common/access/org-access.decorator.js";
import { CurrentUser } from "../../common/decorators/current-user.decorator.js";
import type { AuthUser } from "../../common/decorators/current-user.decorator.js";

@ApiTags('events')
@ApiBearerAuth()
@Controller()
export class EventsController {
    constructor(private events: EventsService) { }

    @OrgAccess(Role.VIEWER, From.orgParam()) @Get('orgs/:orgId/events')
    @ApiOkResponse({ type: EventDto, isArray: true })
    list(@Param('orgId', ParseUUIDPipe) orgId: string) { return this.events.list(orgId); }

    @OrgAccess(Role.EDITOR, From.orgParam()) @Post('orgs/:orgId/events')
    @ApiCreatedResponse({ type: EventDto })
    create(@Param('orgId', ParseUUIDPipe) orgId: string, @Body() dto: CreateEventDto, @CurrentUser() user: AuthUser) {
        return this.events.create(orgId, dto, user.id);
    }

    @OrgAccess(Role.VIEWER, From.eventParam('id')) @Get('events/:id') @ApiOkResponse({ type: EventDto })
    get(@Param('id', ParseUUIDPipe) id: string) { return this.events.get(id); }

    @OrgAccess(Role.ADMIN, From.eventParam('id')) @Patch('events/:id/close') @ApiOkResponse({ type: EventDto })
    close(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
        return this.events.setClosed(id, true, user.id);
    }

    @OrgAccess(Role.ADMIN, From.eventParam('id')) @Patch('events/:id/reopen') @ApiOkResponse({ type: EventDto })
    reopen(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
        return this.events.setClosed(id, false, user.id);
    }
}
