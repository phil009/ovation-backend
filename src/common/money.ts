import { BadRequestException } from '@nestjs/common';

// Amounts travel as digit strings of kobo (1 naira = 100 kobo).
// They are stored as BigInt in Postgres and never touch floating point.

export const KOBO_POSITIVE = /^[1-9]\d{0,17}$/;
export const KOBO_ZERO_OK = /^(0|[1-9]\d{0,17})$/;

/** Converts a validated kobo digit string into a BigInt for Prisma. */
export function toKobo(value: string): bigint {
  if (!KOBO_ZERO_OK.test(value)) throw new BadRequestException('Amount must be a whole number of kobo');
  return BigInt(value);
}
