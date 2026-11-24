// Dev-only: creates an EDITOR account for testing role checks (403s). Not for production.
import 'dotenv/config';
import * as argon2 from 'argon2';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient, Role } from '../src/generated/prisma/client.js';

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
await prisma.user.upsert({
  where: { email: 'editor@ovation.test' },
  update: {},
  create: { email: 'editor@ovation.test', name: 'Test Editor', role: Role.EDITOR, passwordHash: await argon2.hash('editor-pass-123') },
});
console.log('Editor ready: editor@ovation.test');
await prisma.$disconnect();
