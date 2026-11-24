// Creates the first account and an organisation it administers. Safe to run again.
// Run with: pnpm db:seed   (reads SEED_ADMIN_EMAIL, SEED_ADMIN_PASSWORD, optional SEED_ORG_NAME from .env)
import 'dotenv/config';
import * as argon2 from 'argon2';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient, Role } from '../src/generated/prisma/client.js';

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

async function main() {
  const email = process.env.SEED_ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.SEED_ADMIN_PASSWORD;
  const orgName = process.env.SEED_ORG_NAME ?? 'Demo organisation';
  if (!email || !password) throw new Error('Set SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD');

  const user = await prisma.user.upsert({
    where: { email },
    update: {},
    create: { email, name: 'Admin', passwordHash: await argon2.hash(password) },
  });

  const hasOrg = await prisma.membership.findFirst({ where: { userId: user.id } });
  if (hasOrg) {
    console.log(`Admin ready: ${email} (already in an organisation, nothing else to do)`);
    return;
  }
  const org = await prisma.organization.create({ data: { name: orgName, createdById: user.id } });
  await prisma.membership.create({ data: { userId: user.id, organizationId: org.id, role: Role.ADMIN } });
  console.log(`Admin ready: ${email}, admin of "${org.name}"`);
}

main().finally(() => prisma.$disconnect());
