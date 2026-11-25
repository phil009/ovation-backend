import { ConflictException, Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { PrismaService } from "../../prisma/prisma.service.js";
import { Prisma } from "../../generated/prisma/client.js";

const REFRESH_TTL_MS = 7 * 24 * 60 * 60 * 1000;
/**
 * A spent refresh token sent again within this window is treated as a retry (lost response,
 * two tabs): it gets back the same replacement token, as long as that replacement is unused.
 * Later than this, it's treated as possible theft.
 */
const REUSE_GRACE_MS = 2 * 60 * 1000;

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');

/**
 * The replacement token is stored encrypted with a key derived from the OLD token's plaintext.
 * The database only has the old token's SHA-256 (a different derivation), so a database leak
 * can't open it; only whoever holds the old token can.
 */
const sealKey = (token: string) => createHash('sha256').update(`ovation-refresh-seal:${token}`).digest();

function seal(secret: string, withToken: string) {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', sealKey(withToken), iv);
    const body = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);
    return Buffer.concat([iv, cipher.getAuthTag(), body]).toString('base64url');
}

function unseal(sealed: string, withToken: string) {
    const raw = Buffer.from(sealed, 'base64url');
    const decipher = createDecipheriv('aes-256-gcm', sealKey(withToken), raw.subarray(0, 12));
    decipher.setAuthTag(raw.subarray(12, 28));
    return Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString('utf8');
}

type UserRow = { id: string; email: string; name: string };

/**
 * Sessions:
 * - access token: a JWT valid for 15 minutes, sent as "Authorization: Bearer ...".
 * - refresh token: a random string. Only its SHA-256 hash is stored, so a database leak doesn't
 *   hand out sessions. Every refresh revokes it and issues a new one ("rotation"). Each new
 *   refresh token is valid 7 days from that refresh (sliding), so a user who comes back at least
 *   once a week stays signed in.
 * - retries: if the old token is sent again within REUSE_GRACE_MS and its replacement hasn't been
 *   used yet, the same replacement comes back (with a fresh access token). So a refresh whose
 *   response got lost can simply be retried.
 * - theft: if an old, already-replaced token shows up later than that, someone may have stolen
 *   it, so every session of that user is revoked. Only tokens revoked by rotation count: one
 *   ended by logout, logout-all or a password change just gets a 401.
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
            return this.toSession(await this.issueSession(this.prisma, user));
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
        return this.toSession(await this.issueSession(this.prisma, user));
    }

    async refresh(refreshToken: string) {
        const now = new Date();
        const outcome = await this.prisma.$transaction(async (tx) => {
            const row = await tx.refreshToken.findUnique({
                where: { tokenHash: sha256(refreshToken) },
                include: { user: true },
            });
            if (!row || row.expiresAt <= now) return { kind: 'invalid' as const };

            if (!row.revokedAt) {
                // Only one of two simultaneous refreshes with the same token can win this update;
                // the loser waits for the winner to commit, then takes the retry path below.
                const { count } = await tx.refreshToken.updateMany({
                    where: { id: row.id, revokedAt: null },
                    data: { revokedAt: now },
                });
                if (count === 1) {
                    const next = await this.issueSession(tx, row.user);
                    await tx.refreshToken.update({
                        where: { id: row.id },
                        data: { replacedById: next.tokenId, successorSealed: seal(next.refreshToken, refreshToken) },
                    });
                    // The token before this one can't be replayed any more: its replacement is now spent.
                    await tx.refreshToken.updateMany({ where: { replacedById: row.id }, data: { successorSealed: null } });
                    return { kind: 'ok' as const, session: this.toSession(next) };
                }
            }

            // Already used. A retry within the grace window gets the same, still unused, replacement.
            const spent = await tx.refreshToken.findUniqueOrThrow({ where: { id: row.id }, include: { replacedBy: true } });
            // Revoked without a replacement: ended by logout, logout-all or a password change, not by
            // a refresh. Reusing it says nothing about theft, so it is a plain 401 (other sessions,
            // such as the new one after a password change, stay signed in).
            if (!spent.replacedById) return { kind: 'invalid' as const };
            const revokedAt = spent.revokedAt ?? now;
            if (now.getTime() - revokedAt.getTime() > REUSE_GRACE_MS) {
                return { kind: 'stolen' as const, userId: row.userId };
            }
            const next = spent.replacedBy;
            if (!next || next.revokedAt || next.expiresAt <= now || !spent.successorSealed) {
                return { kind: 'invalid' as const };
            }
            return {
                kind: 'ok' as const,
                session: this.toSession({
                    refreshToken: unseal(spent.successorSealed, refreshToken),
                    accessToken: await this.signAccess(row.user),
                    user: row.user,
                }),
            };
        });

        if (outcome.kind === 'ok') return outcome.session;
        if (outcome.kind === 'stolen') await this.revokeAll(outcome.userId); // committed, then refuse
        throw new UnauthorizedException('Invalid refresh token');
    }

    /** Ends one session. Always succeeds, so it can't be used to test whether a token exists. */
    async logout(refreshToken: string) {
        const now = new Date();
        await this.prisma.$transaction(async (tx) => {
            const row = await tx.refreshToken.findUnique({ where: { tokenHash: sha256(refreshToken) } });
            if (!row) return;
            // If this token's refresh response was lost, also end the replacement the app never saw.
            const ids = row.replacedById && row.successorSealed ? [row.id, row.replacedById] : [row.id];
            await tx.refreshToken.updateMany({ where: { id: { in: ids }, revokedAt: null }, data: { revokedAt: now } });
            await tx.refreshToken.update({ where: { id: row.id }, data: { successorSealed: null } });
        });
    }

    /** Ends every session of the user (all devices). Access tokens still live up to 15 minutes. */
    async revokeAll(userId: string) {
        await this.prisma.refreshToken.updateMany({
            where: { userId, revokedAt: null },
            data: { revokedAt: new Date() },
        });
        // Also stop spent tokens from replaying their (now revoked) replacements.
        await this.prisma.refreshToken.updateMany({
            where: { userId, successorSealed: { not: null } },
            data: { successorSealed: null },
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
            const now = new Date();
            await tx.user.update({ where: { id: userId }, data: { passwordHash } });
            await tx.refreshToken.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: now } });
            await tx.refreshToken.updateMany({
                where: { userId, successorSealed: { not: null } },
                data: { successorSealed: null },
            });
            return this.toSession(await this.issueSession(tx, user));
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

    /** Stores a new refresh token (valid 7 days from now) and signs an access token. */
    private async issueSession(db: Prisma.TransactionClient, user: UserRow) {
        const refreshToken = randomBytes(32).toString('base64url');
        const { id: tokenId } = await db.refreshToken.create({
            data: { userId: user.id, tokenHash: sha256(refreshToken), expiresAt: new Date(Date.now() + REFRESH_TTL_MS) },
            select: { id: true },
        });
        return { tokenId, refreshToken, accessToken: await this.signAccess(user), user };
    }

    private signAccess(user: UserRow) {
        return this.jwt.signAsync(
            { sub: user.id, email: user.email },
            { secret: this.config.getOrThrow<string>("JWT_ACCESS_SECRET"), expiresIn: '15m' },
        );
    }

    private toSession(s: { accessToken: string; refreshToken: string; user: UserRow }) {
        return {
            accessToken: s.accessToken,
            refreshToken: s.refreshToken,
            user: { id: s.user.id, email: s.user.email, name: s.user.name },
        };
    }
}

const normaliseEmail = (email: string) => email.trim().toLowerCase();
