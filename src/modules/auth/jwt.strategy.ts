import { Injectable } from "@nestjs/common";
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { AuthUser } from "../../common/decorators/current-user.decorator.js";

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
    constructor(config: ConfigService) {
        super({
            jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
            secretOrKey: config.getOrThrow<string>("JWT_ACCESS_SECRET"),
        });
    }

    /** Becomes request.user. Roles are per organisation, so they are looked up per request, not stored here. */
    validate(payload: { sub: string; email: string }): AuthUser {
        return { id: payload.sub, email: payload.email };
    }
}
