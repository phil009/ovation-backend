import { plainToInstance, Transform } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, Min, MinLength, validateSync } from 'class-validator';

/**
 * Checked once at startup by ConfigModule. A missing or weak setting stops the app with a clear
 * message instead of failing later on the first request that needs it.
 */
class Env {
  @IsIn(['development', 'production', 'test']) @IsOptional()
  NODE_ENV: 'development' | 'production' | 'test' = 'development';

  @IsString() @MinLength(1)
  DATABASE_URL: string;

  @IsString() @MinLength(32, { message: 'JWT_ACCESS_SECRET must be at least 32 characters (use a long random string)' })
  JWT_ACCESS_SECRET: string;

  @Transform(({ value }) => (value === undefined || value === '' ? 5000 : Number(value)))
  @IsInt() @Min(1) @Max(65535)
  PORT: number = 5000;

  /** Comma-separated frontend origins, e.g. "https://app.ovation.ng,https://staging.ovation.ng". */
  @IsString() @IsOptional()
  CORS_ORIGINS?: string;

  /** Set when running behind a proxy/load balancer, so rate limits see the real client IP (e.g. "1"). */
  @IsString() @IsOptional()
  TRUST_PROXY?: string;

  @Transform(({ value }) => (value === undefined || value === '' ? 300 : Number(value)))
  @IsInt() @Min(1)
  RATE_LIMIT_PER_MINUTE: number = 300;

  @Transform(({ value }) => (value === undefined || value === '' ? 10 : Number(value)))
  @IsInt() @Min(1)
  AUTH_RATE_LIMIT_PER_MINUTE: number = 10;

  @IsIn(['true', 'false']) @IsOptional()
  SDK_DOWNLOAD_ENABLED?: string;

  /** false hides /api/docs and /api/openapi.json (production). */
  @IsIn(['true', 'false']) @IsOptional()
  DOCS_ENABLED?: string;

  @IsIn(['true', 'false']) @IsOptional()
  OBSERVE_ENABLED?: string;

  @IsString() @IsOptional() @MinLength(1)
  OBSERVE_SERVICE_ID?: string;
}

export function validateEnv(raw: Record<string, unknown>) {
  const env = plainToInstance(Env, raw, { exposeDefaultValues: true });
  const errors = validateSync(env, { skipMissingProperties: false });
  const problems = errors.flatMap((e) => Object.values(e.constraints ?? {}));

  if (env.NODE_ENV === 'production' && !env.CORS_ORIGINS) {
    problems.push('CORS_ORIGINS must be set in production (the frontend URL, comma-separated if several)');
  }
  if (problems.length > 0) {
    throw new Error('Invalid environment configuration (.env):\n  - ' + problems.join('\n  - '));
  }
  return env;
}
