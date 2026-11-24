import { BadRequestException, SetMetadata } from '@nestjs/common';
import { Role } from '../../generated/prisma/enums.js';
import type { PrismaService } from '../../prisma/prisma.service.js';

/**
 * Every non-public route must say who may call it:
 *   @AccountScope()                        any logged-in user; no organisation involved
 *   @OrgAccess(Role.X, From.something())   a member of the resource's organisation with at least role X
 * OrgAccessGuard refuses any route that declares neither, so a forgotten check can't leak data.
 */

export const ORG_ACCESS_KEY = 'orgAccess';
export const ACCOUNT_SCOPE_KEY = 'accountScope';

type Req = { params?: Record<string, unknown>; query?: Record<string, unknown>; body?: unknown };

/** Finds the organisation id(s) a request touches. null = the resource doesn't exist (404). */
export type OrgResolver = (req: Req, prisma: PrismaService) => Promise<string[] | null>;

export interface OrgAccessOptions {
  minRole: Role;
  resolve: OrgResolver;
}

export const OrgAccess = (minRole: Role, resolve: OrgResolver) =>
  SetMetadata(ORG_ACCESS_KEY, { minRole, resolve } satisfies OrgAccessOptions);

export const AccountScope = () => SetMetadata(ACCOUNT_SCOPE_KEY, true);

const str = (value: unknown, where: string) => {
  if (typeof value !== 'string' || value.length === 0) throw new BadRequestException(`${where} is required`);
  return value;
};

const orgOfEvent = async (prisma: PrismaService, eventId: string) => {
  const event = await prisma.event.findUnique({ where: { id: eventId }, select: { organizationId: true } });
  return event ? [event.organizationId] : null;
};

/** Where to find the organisation for a route. */
export const From = {
  /** /orgs/:orgId/... */
  orgParam: (name = 'orgId'): OrgResolver => async (req) => [str(req.params?.[name], `Path parameter ${name}`)],

  /** /events/:id/... or /events/:eventId/... */
  eventParam: (name: string): OrgResolver => (req, prisma) => orgOfEvent(prisma, str(req.params?.[name], `Path parameter ${name}`)),

  /** ?eventId=... */
  eventQuery: (name = 'eventId'): OrgResolver => (req, prisma) => orgOfEvent(prisma, str(req.query?.[name], `Query parameter ${name}`)),

  /** { eventId: ... } in the body */
  eventBody: (name = 'eventId'): OrgResolver => (req, prisma) =>
    orgOfEvent(prisma, str((req.body as Record<string, unknown> | undefined)?.[name], `Body field ${name}`)),

  /** /donations/:id */
  donationParam: (name = 'id'): OrgResolver => async (req, prisma) => {
    const donation = await prisma.donation.findUnique({
      where: { id: str(req.params?.[name], `Path parameter ${name}`) },
      select: { event: { select: { organizationId: true } } },
    });
    return donation ? [donation.event.organizationId] : null;
  },

  /** { donations: [{ eventId }, ...] }: every event must exist; the caller needs access to all their orgs. */
  batchEvents: (): OrgResolver => async (req, prisma) => {
    const items = (req.body as { donations?: unknown } | undefined)?.donations;
    if (!Array.isArray(items) || items.length === 0) throw new BadRequestException('donations must be a non-empty array');
    const ids = [...new Set(items.map((d, i) => str((d as Record<string, unknown>)?.eventId, `donations[${i}].eventId`)))];
    const events = await prisma.event.findMany({ where: { id: { in: ids } }, select: { organizationId: true } });
    if (events.length !== ids.length) return null;
    return [...new Set(events.map((e) => e.organizationId))];
  },
};
