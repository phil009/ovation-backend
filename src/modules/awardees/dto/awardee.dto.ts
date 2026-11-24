import { ApiProperty } from '@nestjs/swagger';
import { PaymentMode } from '../../../generated/prisma/enums.js';

export class AwardeeDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty({ format: 'uuid' }) eventId: string;
  @ApiProperty({ type: Number, nullable: true }) number: number | null;
  @ApiProperty() name: string;
  @ApiProperty({ type: String, description: 'Kobo as a digit string', example: '300000000' }) amountKobo: string;
  @ApiProperty({ enum: PaymentMode, enumName: 'PaymentMode', nullable: true }) paymentMode: PaymentMode | null;
  @ApiProperty({ type: String, format: 'date-time' }) createdAt: Date;
}
