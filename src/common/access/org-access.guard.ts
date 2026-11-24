import {
  CanActivate, ExecutionContext, ForbiddenException, Injectable, Logger, NotFoundException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '../../prisma/prisma.service.js';
import { Role } from '../../generated/prisma/enums.js';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator.js';
import { ACCOUNT_SCOPE_KEY, ORG_ACCESS_KEY, OrgAccessOptions } from './org-access.decorator.js';
import { hasRole } from './roles.js';

export interface RequestMembership {
  organizationId: string;
  role: Role;
}

/**
 * Global guard, runs after JwtAuthGuard. Decides per organisation:
 * - not a member of the resource's organisation -> 404 (we don't confirm the thing exists)
 * - a member, but the role is too low           -> 403
 * On success, request.membership holds the caller's role in that organisation.
 */
@Injectable()
export class OrgAccessGuard implements CanActivate {
  private readonly logger = new Logger(OrgAccessGuard.name);

  constructor(private reflector: Reflector, private prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const targets = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, targets)) return true;
    if (this.reflector.getAllAndOverride<boolean>(ACCOUNT_SCOPE_KEY, targets)) return true;

    const options = this.reflector.getAllAndOverride<OrgAccessOptions | undefined>(ORG_ACCESS_KEY, targets);
    if (!options) {
      // Safe default: a route nobody declared access for is closed.
      this.logger.error(`${context.getClass().name}.${context.getHandler().name} has no @OrgAccess/@AccountScope/@Public`);
      throw new ForbiddenException('This route has no access rule');
    }

    const req = context.switchToHttp().getRequest();
    const userId: string | undefined = req.user?.id;
    if (!userId) throw new ForbiddenException();

    const orgIds = await options.resolve(req, this.prisma);
    if (!orgIds || orgIds.length === 0) throw new NotFoundException('Not found');

    const memberships = await this.prisma.membership.findMany({
      where: { userId, organizationId: { in: orgIds } },
      select: { organizationId: true, role: true },
    });
    if (memberships.length !== orgIds.length) throw new NotFoundException('Not found');
    if (!memberships.every((m) => hasRole(m.role, options.minRole))) {
      throw new ForbiddenException('Your role in this organisation does not allow this');
    }

    if (memberships.length === 1) req.membership = memberships[0] satisfies RequestMembership;
    return true;
  }
}
