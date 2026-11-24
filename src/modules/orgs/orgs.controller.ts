import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import {
  ApiBearerAuth, ApiConflictResponse, ApiCreatedResponse, ApiGoneResponse, ApiNoContentResponse,
  ApiNotFoundResponse, ApiOkResponse, ApiTags,
} from '@nestjs/swagger';
import { Role } from '../../generated/prisma/enums.js';
import { AccountScope, From, OrgAccess } from '../../common/access/org-access.decorator.js';
import type { RequestMembership } from '../../common/access/org-access.guard.js';
import { CurrentMembership, CurrentUser } from '../../common/decorators/current-user.decorator.js';
import type { AuthUser } from '../../common/decorators/current-user.decorator.js';
import { SensitiveThrottle } from '../../common/throttle.js';
import { OrgsService } from './orgs.service.js';
import { InvitesService } from './invites.service.js';
import {
  AcceptInviteDto, ChangeRoleDto, CreateInviteDto, CreateOrgDto, InviteDto, InvitePreviewDto,
  JoinResultDto, MemberDto, OrgDto,
} from './dto/orgs.dto.js';

@ApiTags('organizations')
@ApiBearerAuth()
@Controller('orgs')
export class OrgsController {
  constructor(private orgs: OrgsService) {}

  @AccountScope() @Post() @ApiCreatedResponse({ type: OrgDto, description: 'You become its first admin' })
  create(@Body() dto: CreateOrgDto, @CurrentUser() user: AuthUser) {
    return this.orgs.create(dto.name, user.id);
  }

  @AccountScope() @Get() @ApiOkResponse({ type: OrgDto, isArray: true, description: 'Organisations you belong to' })
  listMine(@CurrentUser() user: AuthUser) {
    return this.orgs.listMine(user.id);
  }

  @OrgAccess(Role.VIEWER, From.orgParam()) @Get(':orgId') @ApiOkResponse({ type: OrgDto })
  get(@Param('orgId', ParseUUIDPipe) orgId: string, @CurrentMembership() me: RequestMembership) {
    return this.orgs.get(orgId, me);
  }

  @OrgAccess(Role.ADMIN, From.orgParam()) @Patch(':orgId') @ApiOkResponse({ type: OrgDto })
  rename(@Param('orgId', ParseUUIDPipe) orgId: string, @Body() dto: CreateOrgDto, @CurrentUser() user: AuthUser) {
    return this.orgs.rename(orgId, dto.name, user.id);
  }
}

@ApiTags('organizations')
@ApiBearerAuth()
@Controller('orgs/:orgId/members')
export class MembersController {
  constructor(private orgs: OrgsService) {}

  @OrgAccess(Role.ADMIN, From.orgParam()) @Get() @ApiOkResponse({ type: MemberDto, isArray: true })
  list(@Param('orgId', ParseUUIDPipe) orgId: string) {
    return this.orgs.members(orgId);
  }

  @OrgAccess(Role.ADMIN, From.orgParam()) @Patch(':userId')
  @ApiOkResponse({ type: MemberDto }) @ApiConflictResponse({ description: 'Would leave the organisation without an admin' })
  changeRole(
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body() dto: ChangeRoleDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.orgs.changeRole(orgId, userId, dto.role, user.id);
  }

  /** Admins remove members; anyone can remove themselves to leave. */
  @OrgAccess(Role.VIEWER, From.orgParam()) @Delete(':userId') @HttpCode(204)
  @ApiNoContentResponse() @ApiConflictResponse({ description: 'Would leave the organisation without an admin' })
  remove(
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @Param('userId', ParseUUIDPipe) userId: string,
    @CurrentUser() user: AuthUser,
    @CurrentMembership() me: RequestMembership,
  ) {
    return this.orgs.remove(orgId, userId, user.id, me);
  }
}

@ApiTags('organizations')
@ApiBearerAuth()
@Controller()
export class InvitesController {
  constructor(private invites: InvitesService) {}

  @OrgAccess(Role.ADMIN, From.orgParam()) @Post('orgs/:orgId/invites') @ApiCreatedResponse({ type: InviteDto })
  create(@Param('orgId', ParseUUIDPipe) orgId: string, @Body() dto: CreateInviteDto, @CurrentUser() user: AuthUser) {
    return this.invites.create(orgId, dto, user.id);
  }

  @OrgAccess(Role.ADMIN, From.orgParam()) @Get('orgs/:orgId/invites') @ApiOkResponse({ type: InviteDto, isArray: true })
  list(@Param('orgId', ParseUUIDPipe) orgId: string) {
    return this.invites.list(orgId);
  }

  @OrgAccess(Role.ADMIN, From.orgParam()) @Delete('orgs/:orgId/invites/:inviteId') @ApiOkResponse({ type: InviteDto, description: 'Revoked' })
  revoke(
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @Param('inviteId', ParseUUIDPipe) inviteId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.invites.revoke(orgId, inviteId, user.id);
  }

  @AccountScope() @SensitiveThrottle() @Post('invites/preview')
  @HttpCode(200) @ApiOkResponse({ type: InvitePreviewDto })
  @ApiNotFoundResponse({ description: 'No such code' }) @ApiGoneResponse({ description: 'Expired, used up or revoked' })
  preview(@Body() dto: AcceptInviteDto, @CurrentUser() user: AuthUser) {
    return this.invites.preview(dto.code, user.id);
  }

  @AccountScope() @SensitiveThrottle() @Post('invites/accept')
  @ApiCreatedResponse({ type: JoinResultDto })
  @ApiNotFoundResponse({ description: 'No such code' }) @ApiGoneResponse({ description: 'Expired, used up or revoked' })
  @ApiConflictResponse({ description: 'Already a member' })
  accept(@Body() dto: AcceptInviteDto, @CurrentUser() user: AuthUser) {
    return this.invites.accept(dto.code, user.id);
  }
}
