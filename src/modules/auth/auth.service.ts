import { Injectable, UnauthorizedException } from "@nestjs/common";
import { UsersService } from "../users/users.service.js";
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';

@Injectable()
export class AuthService{
    constructor(
        private users: UsersService,
        private jwt: JwtService,
        private config: ConfigService
    ) { }
    
    async login(email: string, password: string) {
        const user = await this.users.findByEmail(email)
        const ok = user && (await argon2.verify(user.passwordHash, password));
        if (!user || !ok) throw new UnauthorizedException('Invalid email or password')
        return this.issueTokens(user);
    }

    async refresh(refreshToken: string) {
        try {
            const payload = await this.jwt.verifyAsync(refreshToken, {
                secret: this.config.getOrThrow<string>("JWT_REFRESH_SECRET")
            });

            const user = await this.users.findById(payload.sub);
            if (!user) throw new Error();
            return this.issueTokens(user);
        } catch {
            throw new UnauthorizedException('Invalid refresh token')
        }
    }

    private async issueTokens(user: { id: string; email: string; role: string; name: string }) {
        const payload = { sub: user.id, email: user.email, role: user.role };
        const [accessToken, refreshToken] = await Promise.all([
            this.jwt.signAsync(payload, {
                secret: this.config.getOrThrow<string>("JWT_ACCESS_SECRET"),
                expiresIn: '15m'
            }),
            this.jwt.signAsync(payload, {
                secret: this.config.getOrThrow<string>("JWT_REFRESH_SECRET"),
                expiresIn: '7d'
            })
        ]);

        return {
            accessToken,
            refreshToken,
            user: { id: user.id, email: user.email, name: user.name, role: user.role }
        };
    }
}
