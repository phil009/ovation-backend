import { Injectable } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client.js';

export type AuditEntity = 'Organization' | 'Membership' | 'InviteCode' | 'Event' | 'Awardee' | 'Donation';
export type AuditAction = 'CREATE' | 'UPDATE' | 'DELETE' | 'CLOSE' | 'REOPEN' | 'REVOKE';

export interface AuditEntry {
  userId: string;
  /** The organisation the change belongs to; its admins can read the entry. */
  organizationId: string;
  action: AuditAction;
  entity: AuditEntity;
  entityId: string;
  before?: object | null;
  after?: object | null;
}

/**
 * Writes audit_log rows. Always called with the transaction client (`tx`) of the change
 * being audited, so the change and its audit row are saved together or not at all.
 */
@Injectable()
export class AuditService {
  record(tx: Prisma.TransactionClient, entry: AuditEntry) {
    return tx.auditLog.create({ data: toRow(entry) });
  }

  recordMany(tx: Prisma.TransactionClient, entries: AuditEntry[]) {
    if (entries.length === 0) return Promise.resolve({ count: 0 });
    return tx.auditLog.createMany({ data: entries.map(toRow) });
  }
}

function toRow(e: AuditEntry): Prisma.AuditLogCreateManyInput {
  return {
    userId: e.userId,
    organizationId: e.organizationId,
    action: e.action,
    entity: e.entity,
    entityId: e.entityId,
    before: e.before ? toJson(e.before) : Prisma.DbNull,
    after: e.after ? toJson(e.after) : Prisma.DbNull,
  };
}

/** BigInt and Date are not JSON: round-trip through JSON (BigInt.toJSON in main.ts makes kobo a string). */
const toJson = (row: object) => JSON.parse(JSON.stringify(row)) as Prisma.InputJsonValue;
