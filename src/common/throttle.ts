import { createHash } from 'node:crypto';
import { Throttle } from '@nestjs/throttler';

/**
 * Rate limits (via @nestjs/throttler, counted in memory per server instance).
 *
 * Who counts as "the same caller": the IP address, plus the email being tried (login, register),
 * plus the refresh token (refresh, logout), plus the user id once logged in. Many phones at one
 * venue can share a single IP on Nigerian mobile networks, so an IP alone would block honest users.
 */
export function rateLimitTracker(req: Record<string, any>): string {
  const parts: string[] = [String(req.ip ?? 'unknown-ip')];
  const body = req.body as Record<string, unknown> | undefined;
  if (typeof body?.email === 'string') parts.push('e:' + body.email.trim().toLowerCase());
  if (typeof body?.refreshToken === 'string') parts.push('t:' + createHash('sha256').update(body.refreshToken).digest('hex').slice(0, 16));
  if (req.user?.id) parts.push('u:' + req.user.id);
  return parts.join('|');
}

/** Requests per minute per caller on ordinary routes. */
export const defaultRateLimit = () => Number(process.env.RATE_LIMIT_PER_MINUTE ?? 300);

/** Tighter limit for password and code guessing targets: login, register, refresh, invite codes. */
export const SensitiveThrottle = () =>
  Throttle({ default: { limit: () => Number(process.env.AUTH_RATE_LIMIT_PER_MINUTE ?? 10), ttl: 60_000 } });
