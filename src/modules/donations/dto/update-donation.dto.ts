import { ApiProperty, OmitType, PartialType } from '@nestjs/swagger';
import { IsInt, Min } from 'class-validator';
import { CreateDonationDto } from './create-donation.dto.js';

export class UpdateDonationDto extends PartialType(OmitType(CreateDonationDto, ['id', 'eventId'] as const)) {
  @ApiProperty({ description: 'The version you last read. A stale version is rejected with 409.' })
  @IsInt() @Min(1) version: number;
}

