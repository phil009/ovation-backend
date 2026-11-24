import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsInt, IsOptional, IsString, Matches, MaxLength, Min, MinLength } from 'class-validator';
import { PaymentMode } from '../../../generated/prisma/enums.js';
import { KOBO_ZERO_OK } from '../../../common/money.js';

export class CreateAwardeeDto {
  @ApiPropertyOptional({ description: 'Number from the notebook', example: 1 })
  @IsOptional() @IsInt() @Min(0) number?: number;

  @ApiProperty({ example: 'Chief Emeka Obi' })
  @IsString() @MinLength(1) @MaxLength(200) name: string;

  @ApiPropertyOptional({ description: "Awardee's own donation in kobo, as a digit string", example: '300000000', pattern: KOBO_ZERO_OK.source })
  @IsOptional() @Matches(KOBO_ZERO_OK, { message: 'amountKobo must be a digit string of kobo' }) amountKobo?: string;

  @ApiPropertyOptional({ enum: PaymentMode, enumName: 'PaymentMode' })
  @IsOptional() @IsEnum(PaymentMode) paymentMode?: PaymentMode;
}
