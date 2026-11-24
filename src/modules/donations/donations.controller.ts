import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import {
  ApiBearerAuth, ApiConflictResponse, ApiCreatedResponse, ApiNoContentResponse, ApiOkResponse, ApiTags,
} from '@nestjs/swagger';
import { Role } from '../../generated/prisma/enums.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { DonationsService } from './donations.service.js';
import { CreateDonationDto } from './dto/create-donation.dto.js';
import { BatchDonationsDto, BatchResultDto } from './dto/batch-donations.dto.js';
import { UpdateDonationDto } from './dto/update-donation.dto.js';
import { ListDonationsQuery } from './dto/list-donations.query.js';
import { DonationDto, DonationListDto } from './dto/donation.dto.js';

type AuthUser = { id: string };

@ApiTags('donations')
@ApiBearerAuth()
@Controller('donations')
export class DonationsController {
  constructor(private donations: DonationsService) {}

  @Roles(Role.ADMIN, Role.EDITOR) @Post() @ApiCreatedResponse({ type: DonationDto })
  create(@Body() dto: CreateDonationDto, @CurrentUser() user: AuthUser) {
    return this.donations.create(dto, user.id);
  }

  @Roles(Role.ADMIN, Role.EDITOR) @Post('batch') @HttpCode(200) @ApiOkResponse({ type: BatchResultDto })
  batch(@Body() dto: BatchDonationsDto, @CurrentUser() user: AuthUser) {
    return this.donations.createBatch(dto.donations, user.id);
  }

  @Get() @ApiOkResponse({ type: DonationListDto })
  list(@Query() q: ListDonationsQuery) {
    return this.donations.list(q);
  }

  @Get(':id') @ApiOkResponse({ type: DonationDto })
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.donations.get(id);
  }

  @Roles(Role.ADMIN) @Patch(':id')
  @ApiOkResponse({ type: DonationDto }) @ApiConflictResponse({ description: 'Stale version: reload and retry' })
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateDonationDto, @CurrentUser() user: AuthUser) {
    return this.donations.update(id, dto, user.id);
  }

  @Roles(Role.ADMIN) @Delete(':id') @HttpCode(204) @ApiNoContentResponse()
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.donations.remove(id, user.id);
  }
}
