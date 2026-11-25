import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsIn, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';

export class ListDonationsQuery {
  @ApiProperty({ format: 'uuid' }) @IsUUID('all') eventId: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'Only donations for this awardee. Not together with general.' })
  @IsOptional() @IsUUID('all') awardeeId?: string;

  @ApiPropertyOptional({ description: 'true: only general donations (no awardee). Not together with awardeeId.' })
  @IsOptional()
  @Transform(({ value }) => (value === 'true' ? true : value === 'false' ? false : value))
  @IsBoolean()
  general?: boolean;

  @ApiPropertyOptional({ description: 'Donor name contains this (any case)', maxLength: 200 })
  @IsOptional() @IsString() @MaxLength(200) q?: string;

  @ApiPropertyOptional({ enum: ['asc', 'desc'], default: 'asc', description: 'By time recorded' })
  @IsOptional() @IsIn(['asc', 'desc']) order?: 'asc' | 'desc';

  @ApiPropertyOptional({ default: 100, maximum: 500 }) @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(500) limit?: number;
  @ApiPropertyOptional({ default: 0 }) @IsOptional() @Type(() => Number) @IsInt() @Min(0) offset?: number;
}
