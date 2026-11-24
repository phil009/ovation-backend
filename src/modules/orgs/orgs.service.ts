import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { Prisma } from '../../generated/prisma/client.js';
import { Role } from '../../generated/prisma/enums.js';
import { lockOrgAdmins } from '../../prisma/lock.js';
import { AuditService } from '../audit/audit.service.js';
import { RequestMembership } from '../../common/access/org-access.guard.js';

@Injectable()
export class OrgsService {
  constructor(private prisma: PrismaService, private audit: AuditService) {}

  /** Anyone with an account can create an organisation; they become its first ADMIN. */
  create(name: string, userId: string) {
    return this.prisma.$transaction(async (tx) => {
      const org = await tx.organization.create({ data: { name: name.trim(), createdById: userId } });
      const membership = await tx.membership.create({ data: { userId, organizationId: org.id, role: Role.ADMIN } });
      await this.audit.recordMany(tx, [
        { userId, organizationId: org.id, action: 'CREATE', entity: 'Organization', entityId: org.id, after: org },
        { userId, organizationId: org.id, action: 'CREATE', entity: 'Membership', entityId: membership.id, after: membership },
      ]);
      return { id: org.id, name: org.name, createdAt: org.createdAt, myRole: membership.role };
    });
  }

  async listMine(userId: string) {
    const memberships = await this.prisma.membership.findMany({
      where: { userId },
      orderBy: { createdAt: 'asc' },
      select: { role: true, organization: { select: { id: true, name: true, createdAt: true } } },
    });
    return memberships.map((m) => ({ ...m.organization, myRole: m.role }));
  }

  async get(orgId: string, me: RequestMembership) {
    const org = await this.prisma.organization.findUniqueOrThrow({
      where: { id: orgId },
      select: { id: true, name: true, createdAt: true },
    });
    return { ...org, myRole: me.role };
  }

  rename(orgId: string, name: string, userId: string) {
    return this.prisma.$transaction(async (tx) => {
      const before = await tx.organization.findUniqueOrThrow({ where: { id: orgId } });
      const after = await tx.organization.update({ where: { id: orgId }, data: { name: name.trim() } });
      await this.audit.record(tx, { userId, organizationId: orgId, action: 'UPDATE', entity: 'Organization', entityId: orgId, before, after });
      return { id: after.id, name: after.name, createdAt: after.createdAt, myRole: Role.ADMIN };
    });
  }

  async members(orgId: string) {
    const rows = await this.prisma.membership.findMany({
      where: { organizationId: orgId },
      orderBy: { createdAt: 'asc' },
      select: { role: true, createdAt: true, user: { select: { id: true, name: true, email: true } } },
    });
    return rows.map((m) => ({ userId: m.user.id, name: m.user.name, email: m.user.email, role: m.role, joinedAt: m.createdAt }));
  }

  changeRole(orgId: string, targetUserId: string, role: Role, actorId: string) {
    return this.prisma.$transaction(async (tx) => {
      await lockOrgAdmins(tx, orgId);
      const before = await this.findMembership(tx, orgId, targetUserId);
      if (before.role === role) return this.memberView(tx, before.id);
      if (before.role === Role.ADMIN) await this.assertAnotherAdmin(tx, orgId);

      const after = await tx.membership.update({ where: { id: before.id }, data: { role } });
      await this.audit.record(tx, { userId: actorId, organizationId: orgId, action: 'UPDATE', entity: 'Membership', entityId: after.id, before, after });
      return this.memberView(tx, after.id);
    });
  }

  /** Admins can remove anyone; any member can remove themselves (leave). The last admin can do neither. */
  remove(orgId: string, targetUserId: string, actorId: string, actor: RequestMembership) {
    if (targetUserId !== actorId && actor.role !== Role.ADMIN) {
      throw new ForbiddenException('Only admins can remove other members');
    }
    return this.prisma.$transaction(async (tx) => {
      await lockOrgAdmins(tx, orgId);
      const before = await this.findMembership(tx, orgId, targetUserId);
      if (before.role === Role.ADMIN) await this.assertAnotherAdmin(tx, orgId);

      await tx.membership.delete({ where: { id: before.id } });
      await this.audit.record(tx, { userId: actorId, organizationId: orgId, action: 'DELETE', entity: 'Membership', entityId: before.id, before });
    });
  }

  private async findMembership(tx: Prisma.TransactionClient, orgId: string, userId: string) {
    const m = await tx.membership.findUnique({ where: { userId_organizationId: { userId, organizationId: orgId } } });
    if (!m) throw new NotFoundException('Member not found');
    return m;
  }

  private async assertAnotherAdmin(tx: Prisma.TransactionClient, orgId: string) {
    const admins = await tx.membership.count({ where: { organizationId: orgId, role: Role.ADMIN } });
    if (admins <= 1) {
      throw new ConflictException('An organisation needs at least one admin. Make someone else admin first.');
    }
  }

  private async memberView(tx: Prisma.TransactionClient, membershipId: string) {
    const m = await tx.membership.findUniqueOrThrow({
      where: { id: membershipId },
      select: { role: true, createdAt: true, user: { select: { id: true, name: true, email: true } } },
    });
    return { userId: m.user.id, name: m.user.name, email: m.user.email, role: m.role, joinedAt: m.createdAt };
  }
}
