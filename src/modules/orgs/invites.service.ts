import { ConflictException, GoneException, Injectable, NotFoundException } from '@nestjs/common';
import { randomInt } from 'node:crypto';
import { PrismaService } from '../../prisma/prisma.service.js';
import { InviteCode, Prisma } from '../../generated/prisma/client.js';
import { Role } from '../../generated/prisma/enums.js';
import { lockRow } from '../../prisma/lock.js';
import { AuditService } from '../audit/audit.service.js';

// No 0/O, 1/I/L: codes get read aloud and typed from WhatsApp messages.
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const DAY_MS = 24 * 60 * 60 * 1000;

/** OVN-XXXX-XXXX: 31^8 ≈ 850 billion combinations; guessing is also rate limited. */
function generateCode() {
  const pick = () => Array.from({ length: 4 }, () => ALPHABET[randomInt(ALPHABET.length)]).join('');
  return `OVN-${pick()}-${pick()}`;
}

/** Accepts "ovn 7k2p qx9m", "OVN7K2PQX9M", "7K2P-QX9M"... and returns "OVN-7K2P-QX9M". */
export function normaliseCode(input: string) {
  let s = input.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (s.startsWith('OVN')) s = s.slice(3);
  return s.length === 8 ? `OVN-${s.slice(0, 4)}-${s.slice(4)}` : null;
}

type InviteStatus = 'ACTIVE' | 'EXPIRED' | 'USED_UP' | 'REVOKED';

function statusOf(invite: InviteCode, now = new Date()): InviteStatus {
  if (invite.revokedAt) return 'REVOKED';
  if (invite.expiresAt && invite.expiresAt <= now) return 'EXPIRED';
  if (invite.maxUses !== null && invite.uses >= invite.maxUses) return 'USED_UP';
  return 'ACTIVE';
}

const view = (i: InviteCode) => ({
  id: i.id, code: i.code, role: i.role, maxUses: i.maxUses, uses: i.uses,
  expiresAt: i.expiresAt, revokedAt: i.revokedAt, createdAt: i.createdAt, status: statusOf(i),
});

@Injectable()
export class InvitesService {
  constructor(private prisma: PrismaService, private audit: AuditService) {}

  async create(orgId: string, dto: { role: Role; maxUses?: number; expiresInDays?: number }, userId: string) {
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        return await this.prisma.$transaction(async (tx) => {
          const invite = await tx.inviteCode.create({
            data: {
              organizationId: orgId,
              code: generateCode(),
              role: dto.role,
              maxUses: dto.maxUses ?? null,
              expiresAt: new Date(Date.now() + (dto.expiresInDays ?? 7) * DAY_MS),
              createdById: userId,
            },
          });
          await this.audit.record(tx, { userId, organizationId: orgId, action: 'CREATE', entity: 'InviteCode', entityId: invite.id, after: invite });
          return view(invite);
        });
      } catch (e) {
        // A random code collided with an existing one: try another.
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') continue;
        throw e;
      }
    }
    throw new ConflictException('Could not generate a unique code, please try again');
  }

  async list(orgId: string) {
    const invites = await this.prisma.inviteCode.findMany({ where: { organizationId: orgId }, orderBy: { createdAt: 'desc' } });
    return invites.map(view);
  }

  revoke(orgId: string, inviteId: string, userId: string) {
    return this.prisma.$transaction(async (tx) => {
      await lockRow(tx, 'InviteCode', inviteId);
      const before = await tx.inviteCode.findFirst({ where: { id: inviteId, organizationId: orgId } });
      if (!before) throw new NotFoundException('Invite code not found');
      if (before.revokedAt) return view(before);
      const after = await tx.inviteCode.update({ where: { id: inviteId }, data: { revokedAt: new Date() } });
      await this.audit.record(tx, { userId, organizationId: orgId, action: 'REVOKE', entity: 'InviteCode', entityId: inviteId, before, after });
      return view(after);
    });
  }

  /** Lets the app show "Join Umuoji Town Union as Editor?" before the person commits. */
  async preview(rawCode: string, userId: string) {
    const invite = await this.findUsable(this.prisma, rawCode);
    const org = await this.prisma.organization.findUniqueOrThrow({ where: { id: invite.organizationId }, select: { id: true, name: true } });
    const existing = await this.prisma.membership.findUnique({
      where: { userId_organizationId: { userId, organizationId: org.id } },
    });
    return { organization: org, role: invite.role, alreadyMember: !!existing };
  }

  accept(rawCode: string, userId: string) {
    return this.prisma.$transaction(async (tx) => {
      const found = await this.findUsable(tx, rawCode);
      // Lock the code, then re-read it: with maxUses 1, only one of several simultaneous joins may win.
      await lockRow(tx, 'InviteCode', found.id);
      const invite = await this.findUsable(tx, rawCode);

      const existing = await tx.membership.findUnique({
        where: { userId_organizationId: { userId, organizationId: invite.organizationId } },
      });
      if (existing) throw new ConflictException('You are already a member of this organisation');

      await tx.inviteCode.update({ where: { id: invite.id }, data: { uses: { increment: 1 } } });
      const membership = await tx.membership.create({
        data: { userId, organizationId: invite.organizationId, role: invite.role },
      });
      await this.audit.record(tx, {
        userId, organizationId: invite.organizationId, action: 'CREATE', entity: 'Membership',
        entityId: membership.id, after: { ...membership, inviteCodeId: invite.id },
      });
      const organization = await tx.organization.findUniqueOrThrow({
        where: { id: invite.organizationId }, select: { id: true, name: true },
      });
      return { organization, role: membership.role };
    });
  }

  /** 404 for a code that never existed; 410 Gone for one that did but no longer works. */
  private async findUsable(db: Prisma.TransactionClient, rawCode: string) {
    const code = normaliseCode(rawCode);
    const invite = code ? await db.inviteCode.findUnique({ where: { code } }) : null;
    if (!invite) throw new NotFoundException('Invite code not found');
    const status = statusOf(invite);
    if (status !== 'ACTIVE') {
      const why = { EXPIRED: 'has expired', USED_UP: 'has been used up', REVOKED: 'has been revoked' }[status];
      throw new GoneException(`This invite code ${why}. Ask an admin for a new one.`);
    }
    return invite;
  }
}
