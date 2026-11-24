import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import {
  ApiBearerAuth, ApiConflictResponse, ApiCreatedResponse, ApiNoContentResponse, ApiOkResponse, ApiTags,
} from '@nestjs/swagger';
import { Role } from '../../generated/prisma/enums.js';
import { From, OrgAccess } from '../../common/access/org-access.decorator.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import type { AuthUser } from '../../common/decorators/current-user.decorator.js';
import { DonationsService } from './donations.service.js';
import { CreateDonationDto } from './dto/create-donation.dto.js';
import { BatchDonationsDto, BatchResultDto } from './dto/batch-donations.dto.js';
import { UpdateDonationDto } from './dto/update-donation.dto.js';
import { ListDonationsQuery } from './dto/list-donations.query.js';
import { DonationDto, DonationListDto } from './dto/donation.dto.js';


@ApiTags('donations')
@ApiBearerAuth()
@Controller('donations')
export class DonationsController {
  constructor(private donations: DonationsService) {}

  @OrgAccess(Role.EDITOR, From.eventBody()) @Post() @ApiCreatedResponse({ type: DonationDto })
  create(@Body() dto: CreateDonationDto, @CurrentUser() user: AuthUser) {
    return this.donations.create(dto, user.id);
  }

  @OrgAccess(Role.EDITOR, From.batchEvents()) @Post('batch') @HttpCode(200) @ApiOkResponse({ type: BatchResultDto })
  batch(@Body() dto: BatchDonationsDto, @CurrentUser() user: AuthUser) {
    return this.donations.createBatch(dto.donations, user.id);
  }

  @OrgAccess(Role.VIEWER, From.eventQuery()) @Get() @ApiOkResponse({ type: DonationListDto })
  list(@Query() q: ListDonationsQuery) {
    return this.donations.list(q);
  }

  @OrgAccess(Role.VIEWER, From.donationParam()) @Get(':id') @ApiOkResponse({ type: DonationDto })
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.donations.get(id);
  }

  @OrgAccess(Role.ADMIN, From.donationParam()) @Patch(':id')
  @ApiOkResponse({ type: DonationDto }) @ApiConflictResponse({ description: 'Stale version: reload and retry' })
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateDonationDto, @CurrentUser() user: AuthUser) {
    return this.donations.update(id, dto, user.id);
  }

  @OrgAccess(Role.ADMIN, From.donationParam()) @Delete(':id') @HttpCode(204) @ApiNoContentResponse()
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.donations.remove(id, user.id);
  }
}
