import { ApiProperty } from '@nestjs/swagger';
import { Role } from '../../../generated/prisma/enums.js';

export class AuthUserDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty() email: string;
  @ApiProperty() name: string;
}

export class AuthResponseDto {
  @ApiProperty({ description: 'JWT, valid 15 minutes. Send as "Authorization: Bearer <token>".' }) accessToken: string;
  @ApiProperty({ description: 'Valid 7 days, single use: every refresh returns a new one.' }) refreshToken: string;
  @ApiProperty({ type: AuthUserDto }) user: AuthUserDto;
}

export class OrgSummaryDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty() name: string;
}

export class MyMembershipDto {
  @ApiProperty({ enum: Role, enumName: 'Role' }) role: Role;
  @ApiProperty({ type: OrgSummaryDto }) organization: OrgSummaryDto;
}

export class MeDto extends AuthUserDto {
  @ApiProperty({ type: String, format: 'date-time' }) createdAt: Date;
  @ApiProperty({ type: MyMembershipDto, isArray: true, description: 'Organisations this account belongs to' })
  memberships: MyMembershipDto[];
}
