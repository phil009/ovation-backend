import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiCreatedResponse, ApiNoContentResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { Role } from '../../generated/prisma/enums.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { AwardeesService } from './awardees.service.js';
import { AwardeeDto } from './dto/awardee.dto.js';
import { CreateAwardeeDto } from './dto/create-awardee.dto.js';
import { UpdateAwardeeDto } from './dto/update-awardee.dto.js';

@ApiTags('awardees')
@ApiBearerAuth()
@Controller('events/:eventId/awardees')
export class AwardeesController {
  constructor(private awardees: AwardeesService) {}

  @Get() @ApiOkResponse({ type: AwardeeDto, isArray: true })
  list(@Param('eventId', ParseUUIDPipe) eventId: string) {
    return this.awardees.list(eventId);
  }

  @Roles(Role.ADMIN, Role.EDITOR) @Post() @ApiCreatedResponse({ type: AwardeeDto })
  create(@Param('eventId', ParseUUIDPipe) eventId: string, @Body() dto: CreateAwardeeDto) {
    return this.awardees.create(eventId, dto);
  }

  @Roles(Role.ADMIN) @Patch(':id') @ApiOkResponse({ type: AwardeeDto })
  update(
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateAwardeeDto,
  ) {
    return this.awardees.update(eventId, id, dto);
  }

  @Roles(Role.ADMIN) @Delete(':id') @HttpCode(204) @ApiNoContentResponse()
  remove(@Param('eventId', ParseUUIDPipe) eventId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.awardees.remove(eventId, id);
  }
}
