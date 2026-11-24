import { ApiProperty } from '@nestjs/swagger';
import { DonationStatus, PaymentMode } from '../../../generated/prisma/enums.js';

export class DonationDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty({ format: 'uuid' }) eventId: string;
  @ApiProperty({ type: String, format: 'uuid', nullable: true }) awardeeId: string | null;
  @ApiProperty() donorName: string;
  @ApiProperty({ type: String, description: 'Kobo as a digit string', example: '5000000' }) amountKobo: string;
  @ApiProperty({ enum: PaymentMode, enumName: 'PaymentMode' }) paymentMode: PaymentMode;
  @ApiProperty({ enum: DonationStatus, enumName: 'DonationStatus' }) status: DonationStatus;
  @ApiProperty() needsReview: boolean;
  @ApiProperty({ type: String, nullable: true }) note: string | null;
  @ApiProperty() version: number;
  @ApiProperty({ format: 'uuid' }) createdById: string;
  @ApiProperty({ type: String, format: 'date-time' }) createdAt: Date;
  @ApiProperty({ type: String, format: 'date-time' }) updatedAt: Date;
}

export class DonationListDto {
  @ApiProperty({ type: DonationDto, isArray: true }) items: DonationDto[];
  @ApiProperty() total: number;
}
