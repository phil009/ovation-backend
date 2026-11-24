import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiCreatedResponse, ApiNoContentResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { Role } from '../../generated/prisma/enums.js';
import { From, OrgAccess } from '../../common/access/org-access.decorator.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import type { AuthUser } from '../../common/decorators/current-user.decorator.js';
import { AwardeesService } from './awardees.service.js';
import { AwardeeDto } from './dto/awardee.dto.js';
import { CreateAwardeeDto } from './dto/create-awardee.dto.js';
import { UpdateAwardeeDto } from './dto/update-awardee.dto.js';


@ApiTags('awardees')
@ApiBearerAuth()
@Controller('events/:eventId/awardees')
export class AwardeesController {
  constructor(private awardees: AwardeesService) {}

  @OrgAccess(Role.VIEWER, From.eventParam('eventId')) @Get() @ApiOkResponse({ type: AwardeeDto, isArray: true })
  list(@Param('eventId', ParseUUIDPipe) eventId: string) {
    return this.awardees.list(eventId);
  }

  @OrgAccess(Role.EDITOR, From.eventParam('eventId')) @Post() @ApiCreatedResponse({ type: AwardeeDto })
  create(
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Body() dto: CreateAwardeeDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.awardees.create(eventId, dto, user.id);
  }

  @OrgAccess(Role.ADMIN, From.eventParam('eventId')) @Patch(':id') @ApiOkResponse({ type: AwardeeDto })
  update(
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateAwardeeDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.awardees.update(eventId, id, dto, user.id);
  }

  @OrgAccess(Role.ADMIN, From.eventParam('eventId')) @Delete(':id') @HttpCode(204) @ApiNoContentResponse()
  remove(
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.awardees.remove(eventId, id, user.id);
  }
}
