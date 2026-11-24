import { ApiProperty } from '@nestjs/swagger';
import { Role } from '../../../generated/prisma/client.js';

export class MeDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty() email: string;
  @ApiProperty({ enum: Role, enumName: 'Role' }) role: Role;
}

export class AuthUserDto extends MeDto {
  @ApiProperty() name: string;
}

export class AuthResponseDto {
  @ApiProperty() accessToken: string;
  @ApiProperty() refreshToken: string;
  @ApiProperty({ type: AuthUserDto }) user: AuthUserDto;
}