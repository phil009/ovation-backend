import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { HealthCheck, HealthCheckService, PrismaHealthIndicator } from '@nestjs/terminus';
import { Public } from '../../common/decorators/public.decorator.js';
import { PrismaService } from '../../prisma/prisma.service.js';

/**
 * GET /api/health: 200 when the API can reach Postgres, 503 when it can't.
 * Render calls it before sending traffic to a new deploy and keeps calling it afterwards.
 */
@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(
    private health: HealthCheckService,
    private db: PrismaHealthIndicator,
    private prisma: PrismaService,
  ) {}

  @Public() @SkipThrottle() @Get() @HealthCheck()
  check() {
    return this.health.check([() => this.db.pingCheck('database', this.prisma, { timeout: 3000 })]);
  }
}
