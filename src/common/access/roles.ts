import { Role } from '../../generated/prisma/enums.js';

/** ADMIN can do everything an EDITOR can, and an EDITOR everything a VIEWER can. */
const RANK: Record<Role, number> = { VIEWER: 1, EDITOR: 2, ADMIN: 3 };

export const hasRole = (role: Role, minRole: Role) => RANK[role] >= RANK[minRole];
