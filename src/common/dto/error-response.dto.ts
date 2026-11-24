import { ApiProperty } from '@nestjs/swagger';

/**
 * The body of every error response (Nest's default exception shape).
 * `message` is a list of strings for validation errors (400), a single string otherwise.
 */
export class ErrorResponseDto {
  @ApiProperty({ example: 401 }) statusCode: number;

  @ApiProperty({
    oneOf: [{ type: 'string' }, { type: 'array', items: { type: 'string' } }],
    example: 'Invalid refresh token',
    description: 'A list of strings on 400 (one per invalid field), a single string otherwise',
  })
  message: string | string[];

  @ApiProperty({ example: 'Unauthorized', description: 'The HTTP status text' }) error: string;
}
