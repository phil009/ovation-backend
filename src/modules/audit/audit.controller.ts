import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiProperty, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { Role } from '../../generated/prisma/enums.js';
import { From, OrgAccess } from '../../common/access/org-access.decorator.js';
import { PrismaService } from '../../prisma/prisma.service.js';

const ENTITIES = ['Organization', 'Membership', 'InviteCode', 'Event', 'Awardee', 'Donation'] as const;

export class ListAuditQuery {
  @ApiPropertyOptional({ enum: ENTITIES }) @IsOptional() @IsIn(ENTITIES) entity?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() entityId?: string;
  @ApiPropertyOptional({ format: 'uuid' }) @IsOptional() @IsString() userId?: string;
  @ApiPropertyOptional({ default: 50, maximum: 200 }) @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(200) limit?: number;
  @ApiPropertyOptional({ default: 0 }) @IsOptional() @Type(() => Number) @IsInt() @Min(0) offset?: number;
}

export class AuditUserDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty() name: string;
  @ApiProperty() email: string;
}

export class AuditEntryDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty({ example: 'UPDATE' }) action: string;
  @ApiProperty({ enum: ENTITIES }) entity: string;
  @ApiProperty() entityId: string;
  @ApiProperty({ type: Object, nullable: true, description: 'Row before the change (null for creates)' }) before: unknown;
  @ApiProperty({ type: Object, nullable: true, description: 'Row after the change' }) after: unknown;
  @ApiProperty({ type: String, format: 'date-time' }) createdAt: Date;
  @ApiProperty({ type: AuditUserDto }) user: AuditUserDto;
}

export class AuditListDto {
  @ApiProperty({ type: AuditEntryDto, isArray: true }) items: AuditEntryDto[];
  @ApiProperty() total: number;
}

@ApiTags('audit')
@ApiBearerAuth()
@OrgAccess(Role.ADMIN, From.orgParam())
@Controller('orgs/:orgId/audit-log')
export class AuditController {
  constructor(private prisma: PrismaService) {}

  /** Newest first. Organisation admins only: entries contain donor names and amounts. */
  @Get() @ApiOkResponse({ type: AuditListDto })
  async list(@Param('orgId') orgId: string, @Query() q: ListAuditQuery) {
    const where = { organizationId: orgId, entity: q.entity, entityId: q.entityId, userId: q.userId };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: q.limit ?? 50,
        skip: q.offset ?? 0,
        select: {
          id: true, action: true, entity: true, entityId: true, before: true, after: true, createdAt: true,
          user: { select: { id: true, name: true, email: true } },
        },
      }),
      this.prisma.auditLog.count({ where }),
    ]);
    return { items, total };
  }
}
