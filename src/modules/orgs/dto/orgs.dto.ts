import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';
import { Role } from '../../../generated/prisma/enums.js';

// ---- organisations ----

export class CreateOrgDto {
  @ApiProperty({ example: 'Umuoji Town Union, Lagos branch' })
  @IsString() @MinLength(2) @MaxLength(120) name: string;
}

export class OrgDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty() name: string;
  @ApiProperty({ type: String, format: 'date-time' }) createdAt: Date;
  @ApiProperty({ enum: Role, enumName: 'Role', description: 'Your role in this organisation' }) myRole: Role;
}

// ---- members ----

export class MemberDto {
  @ApiProperty({ format: 'uuid' }) userId: string;
  @ApiProperty() name: string;
  @ApiProperty() email: string;
  @ApiProperty({ enum: Role, enumName: 'Role' }) role: Role;
  @ApiProperty({ type: String, format: 'date-time' }) joinedAt: Date;
}

export class ChangeRoleDto {
  @ApiProperty({ enum: Role, enumName: 'Role' })
  @IsIn(Object.values(Role)) role: Role;
}

// ---- invite codes ----

/** Codes can grant EDITOR or VIEWER. Admins are made by promoting an existing member. */
export const INVITE_ROLES = [Role.EDITOR, Role.VIEWER] as const;

export class CreateInviteDto {
  @ApiProperty({ enum: INVITE_ROLES, enumName: 'InviteRole' })
  @IsIn(INVITE_ROLES) role: Role;

  @ApiPropertyOptional({ description: 'How many people can use it. Leave out for unlimited.', minimum: 1, maximum: 1000 })
  @IsOptional() @IsInt() @Min(1) @Max(1000) maxUses?: number;

  @ApiPropertyOptional({ description: 'Days until it stops working', default: 7, minimum: 1, maximum: 90 })
  @IsOptional() @IsInt() @Min(1) @Max(90) expiresInDays?: number;
}

export class AcceptInviteDto {
  @ApiProperty({ example: 'OVN-7K2P-QX9M', description: 'Case, spaces and dashes are ignored' })
  @IsString() @MaxLength(40) code: string;
}

export class InviteDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty({ example: 'OVN-7K2P-QX9M' }) code: string;
  @ApiProperty({ enum: Role, enumName: 'Role' }) role: Role;
  @ApiProperty({ type: Number, nullable: true }) maxUses: number | null;
  @ApiProperty() uses: number;
  @ApiProperty({ type: String, format: 'date-time', nullable: true }) expiresAt: Date | null;
  @ApiProperty({ type: String, format: 'date-time', nullable: true }) revokedAt: Date | null;
  @ApiProperty({ type: String, format: 'date-time' }) createdAt: Date;
  @ApiProperty({ enum: ['ACTIVE', 'EXPIRED', 'USED_UP', 'REVOKED'] }) status: 'ACTIVE' | 'EXPIRED' | 'USED_UP' | 'REVOKED';
}

export class OrgSummary {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty() name: string;
}

export class InvitePreviewDto {
  @ApiProperty({ type: OrgSummary }) organization: OrgSummary;
  @ApiProperty({ enum: Role, enumName: 'Role', description: 'The role you get by joining' }) role: Role;
  @ApiProperty({ description: 'True if you are already a member' }) alreadyMember: boolean;
}

export class JoinResultDto {
  @ApiProperty({ type: OrgSummary }) organization: OrgSummary;
  @ApiProperty({ enum: Role, enumName: 'Role' }) role: Role;
}
