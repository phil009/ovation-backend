import { ApiProperty } from '@nestjs/swagger';
import { PaymentMode } from '../../../generated/prisma/enums.js';

// Every *Kobo field is a digit string of kobo (1 naira = 100 kobo).

export class SummaryEventDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty() name: string;
  @ApiProperty({ type: String, format: 'date-time' }) date: Date;
  @ApiProperty() closed: boolean;
}

export class AwardeeSummaryDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty({ type: Number, nullable: true }) number: number | null;
  @ApiProperty() name: string;
  @ApiProperty({ enum: PaymentMode, enumName: 'PaymentMode', nullable: true }) paymentMode: PaymentMode | null;
  @ApiProperty({ description: "The awardee's own donation" }) awardeeKobo: string;
  @ApiProperty({ description: 'Sum of all supporters under this awardee' }) supportersKobo: string;
  @ApiProperty() supporterCount: number;
  @ApiProperty({ description: 'Part of the total that is still only pledged' }) pledgedKobo: string;
  @ApiProperty({ description: 'awardeeKobo + supportersKobo' }) totalKobo: string;
}

export class GeneralSummaryDto {
  @ApiProperty({ description: 'Donations made for all awardees' }) totalKobo: string;
  @ApiProperty() count: number;
  @ApiProperty() pledgedKobo: string;
}

export class GrandTotalsDto {
  @ApiProperty() awardeesKobo: string;
  @ApiProperty() supportersKobo: string;
  @ApiProperty() generalKobo: string;
  @ApiProperty({ description: 'awardees + supporters + general' }) totalKobo: string;
  @ApiProperty() pledgedKobo: string;
  @ApiProperty() receivedKobo: string;
  @ApiProperty({ description: 'Number of supporter and general donations' }) donationCount: number;
}

export class EventSummaryDto {
  @ApiProperty({ type: SummaryEventDto }) event: SummaryEventDto;
  @ApiProperty({ type: AwardeeSummaryDto, isArray: true }) awardees: AwardeeSummaryDto[];
  @ApiProperty({ type: GeneralSummaryDto }) general: GeneralSummaryDto;
  @ApiProperty({ type: GrandTotalsDto }) totals: GrandTotalsDto;
}
