import { createParamDecorator, ExecutionContext } from "@nestjs/common";

/** The logged-in user, as set by JwtStrategy. */
export interface AuthUser {
    id: string;
    email: string;
}

export const CurrentUser = createParamDecorator(
    (_data: unknown, ctx: ExecutionContext): AuthUser => ctx.switchToHttp().getRequest().user
);

/** The caller's membership in the route's organisation, as set by OrgAccessGuard. */
export const CurrentMembership = createParamDecorator(
    (_data: unknown, ctx: ExecutionContext) => ctx.switchToHttp().getRequest().membership
);
