import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, ValidateNested } from 'class-validator';
import { CreateDonationDto } from './create-donation.dto.js';

export const MAX_BATCH = 500;

export class BatchDonationsDto {
  @ApiProperty({ type: CreateDonationDto, isArray: true, maxItems: MAX_BATCH })
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(MAX_BATCH)
  @ValidateNested({ each: true }) @Type(() => CreateDonationDto)
  donations: CreateDonationDto[];
}

export class BatchResultDto {
  @ApiProperty({ type: String, isArray: true, description: 'Ids saved by this call' }) created: string[];
  @ApiProperty({ type: String, isArray: true, description: 'Ids that already existed and were left unchanged' }) duplicates: string[];
}
