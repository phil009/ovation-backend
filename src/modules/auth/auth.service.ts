import { ConflictException, Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { createHash, randomBytes } from 'node:crypto';
import { PrismaService } from "../../prisma/prisma.service.js";
import { Prisma } from "../../generated/prisma/client.js";

const REFRESH_TTL_MS = 7 * 24 * 60 * 60 * 1000;
/** A refresh token used again within this window is treated as a harmless double-send (two tabs). */
const REUSE_GRACE_MS = 30 * 1000;

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');

type UserRow = { id: string; email: string; name: string };

/**
 * Sessions:
 * - access token: a JWT valid for 15 minutes, sent as "Authorization: Bearer ...".
 * - refresh token: a random string valid for 7 days. Only its SHA-256 hash is stored, so a
 *   database leak doesn't hand out sessions. Every refresh revokes it and issues a new one
 *   ("rotation"). If an old, already-replaced token shows up again later, someone may have
 *   stolen it, so every session of that user is revoked.
 */
@Injectable()
export class AuthService {
    /** Lets login spend the same time on unknown emails as on wrong passwords. */
    private readonly dummyHash = argon2.hash('not-a-real-password-just-for-timing');

    constructor(
        private prisma: PrismaService,
        private jwt: JwtService,
        private config: ConfigService,
    ) { }

    async register(name: string, email: string, password: string) {
        try {
            const user = await this.prisma.user.create({
                data: { name: name.trim(), email: normaliseEmail(email), passwordHash: await argon2.hash(password) },
            });
            return this.issueSession(this.prisma, user);
        } catch (e) {
            if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
                throw new ConflictException('An account with this email already exists');
            }
            throw e;
        }
    }

    async login(email: string, password: string) {
        const user = await this.prisma.user.findUnique({ where: { email: normaliseEmail(email) } });
        const ok = user
            ? await argon2.verify(user.passwordHash, password)
            : (await argon2.verify(await this.dummyHash, password), false);
        if (!user || !ok) throw new UnauthorizedException('Invalid email or password');
        return this.issueSession(this.prisma, user);
    }

    async refresh(refreshToken: string) {
        const now = new Date();
        const outcome = await this.prisma.$transaction(async (tx) => {
            const row = await tx.refreshToken.findUnique({
                where: { tokenHash: sha256(refreshToken) },
                include: { user: true },
            });
            if (!row || row.expiresAt <= now) return { kind: 'invalid' as const };

            if (row.revokedAt) {
                const reused = now.getTime() - row.revokedAt.getTime() > REUSE_GRACE_MS;
                return { kind: reused ? 'stolen' as const : 'invalid' as const, userId: row.userId };
            }

            // Only one of two simultaneous refreshes with the same token can win this update.
            const { count } = await tx.refreshToken.updateMany({
                where: { id: row.id, revokedAt: null },
                data: { revokedAt: now },
            });
            if (count === 0) return { kind: 'invalid' as const };

            return { kind: 'ok' as const, session: await this.issueSession(tx, row.user) };
        });

        if (outcome.kind === 'ok') return outcome.session;
        if (outcome.kind === 'stolen') await this.revokeAll(outcome.userId); // committed, then refuse
        throw new UnauthorizedException('Invalid refresh token');
    }

    /** Ends one session. Always succeeds, so it can't be used to test whether a token exists. */
    async logout(refreshToken: string) {
        await this.prisma.refreshToken.updateMany({
            where: { tokenHash: sha256(refreshToken), revokedAt: null },
            data: { revokedAt: new Date() },
        });
    }

    /** Ends every session of the user (all devices). Access tokens still live up to 15 minutes. */
    async revokeAll(userId: string) {
        await this.prisma.refreshToken.updateMany({
            where: { userId, revokedAt: null },
            data: { revokedAt: new Date() },
        });
    }

    /** Changes the password, signs out every device, and returns a fresh session for this one. */
    async changePassword(userId: string, currentPassword: string, newPassword: string) {
        const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
        if (!(await argon2.verify(user.passwordHash, currentPassword))) {
            throw new UnauthorizedException('Current password is wrong');
        }
        const passwordHash = await argon2.hash(newPassword);
        return this.prisma.$transaction(async (tx) => {
            await tx.user.update({ where: { id: userId }, data: { passwordHash } });
            await tx.refreshToken.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
            return this.issueSession(tx, user);
        });
    }

    me(userId: string) {
        return this.prisma.user.findUniqueOrThrow({
            where: { id: userId },
            select: {
                id: true, email: true, name: true, createdAt: true,
                memberships: {
                    orderBy: { createdAt: 'asc' },
                    select: { role: true, organization: { select: { id: true, name: true } } },
                },
            },
        });
    }

    private async issueSession(db: Prisma.TransactionClient, user: UserRow) {
        const refreshToken = randomBytes(32).toString('base64url');
        await db.refreshToken.create({
            data: { userId: user.id, tokenHash: sha256(refreshToken), expiresAt: new Date(Date.now() + REFRESH_TTL_MS) },
        });
        const accessToken = await this.jwt.signAsync(
            { sub: user.id, email: user.email },
            { secret: this.config.getOrThrow<string>("JWT_ACCESS_SECRET"), expiresIn: '15m' },
        );
        return {
            accessToken,
            refreshToken,
            user: { id: user.id, email: user.email, name: user.name },
        };
    }
}

const normaliseEmail = (email: string) => email.trim().toLowerCase();
