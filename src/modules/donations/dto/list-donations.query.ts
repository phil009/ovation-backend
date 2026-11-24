import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';

export class ListDonationsQuery {
  @ApiProperty({ format: 'uuid' }) @IsUUID('all') eventId: string;
  @ApiPropertyOptional({ format: 'uuid' }) @IsOptional() @IsUUID('all') awardeeId?: string;
  @ApiPropertyOptional({ default: 100, maximum: 500 }) @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(500) limit?: number;
  @ApiPropertyOptional({ default: 0 }) @IsOptional() @Type(() => Number) @IsInt() @Min(0) offset?: number;
}
