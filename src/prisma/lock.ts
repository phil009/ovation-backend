import { Prisma } from '../generated/prisma/client.js';

const TABLES = {
  Event: 'events',
  Awardee: 'awardees',
  Donation: 'donations',
  InviteCode: 'invite_codes',
} as const;

/**
 * Locks one row until the surrounding transaction ends (SELECT ... FOR UPDATE).
 * Anyone else changing the same row waits for us, so the "before" we read next stays true.
 * Only works inside prisma.$transaction(async (tx) => ...).
 */
export async function lockRow(tx: Prisma.TransactionClient, entity: keyof typeof TABLES, id: string) {
  // Table names come from the fixed map above, never from the request.
  await tx.$queryRaw`SELECT 1 FROM ${Prisma.raw(`"${TABLES[entity]}"`)} WHERE id = ${id} FOR UPDATE`;
}

/**
 * Locks every ADMIN membership of an organisation. Used before demoting or removing an admin,
 * so two admins can't remove each other at the same moment and leave the organisation with none.
 */
export async function lockOrgAdmins(tx: Prisma.TransactionClient, organizationId: string) {
  await tx.$queryRaw`SELECT 1 FROM "memberships" WHERE "organizationId" = ${organizationId} AND role = 'ADMIN' FOR UPDATE`;
}
