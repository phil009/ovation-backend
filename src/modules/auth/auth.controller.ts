import { Body, Controller, Get, HttpCode, Patch, Post } from "@nestjs/common";
import {
    ApiBearerAuth, ApiConflictResponse, ApiCreatedResponse, ApiNoContentResponse, ApiOkResponse,
    ApiTags, ApiTooManyRequestsResponse, ApiUnauthorizedResponse,
} from "@nestjs/swagger";
import { ErrorResponseDto } from "../../common/dto/error-response.dto.js";
import { AuthService } from "./auth.service.js";
import { Public } from "../../common/decorators/public.decorator.js";
import { AccountScope } from "../../common/access/org-access.decorator.js";
import { SensitiveThrottle } from "../../common/throttle.js";
import { ChangePasswordDto, LoginDto, RegisterDto } from "./dto/login.dto.js";
import { RefreshDto } from "./dto/refresh.dto.js";
import { CurrentUser } from "../../common/decorators/current-user.decorator.js";
import type { AuthUser } from "../../common/decorators/current-user.decorator.js";
import { AuthResponseDto, MeDto } from "./dto/auth-response.dto.js";

@ApiTags('auth')
@Controller("auth")
export class AuthController {
    constructor(private auth: AuthService) { }

    @Public() @SensitiveThrottle() @Post("register")
    @ApiCreatedResponse({ type: AuthResponseDto }) @ApiConflictResponse({ description: 'Email already registered' })
    @ApiTooManyRequestsResponse()
    register(@Body() dto: RegisterDto) { return this.auth.register(dto.name, dto.email, dto.password); }

    @Public() @SensitiveThrottle() @Post("login")
    @ApiCreatedResponse({ type: AuthResponseDto }) @ApiTooManyRequestsResponse({ type: ErrorResponseDto })
    @ApiUnauthorizedResponse({ type: ErrorResponseDto, description: 'Wrong email or password' })
    login(@Body() dto: LoginDto) { return this.auth.login(dto.email, dto.password); }

    @Public() @SensitiveThrottle() @Post("refresh")
    @ApiCreatedResponse({
        type: AuthResponseDto,
        description: 'A new pair; the old refresh token is spent. Sending the old token again within 2 minutes '
            + 'returns the same new refresh token (while it is unused), so a lost response can be retried.',
    })
    @ApiUnauthorizedResponse({ type: ErrorResponseDto, description: 'Unknown, expired, revoked or replayed token: sign in again' })
    @ApiTooManyRequestsResponse({ type: ErrorResponseDto })
    refresh(@Body() dto: RefreshDto) { return this.auth.refresh(dto.refreshToken); }

    @Public() @SensitiveThrottle() @Post("logout") @HttpCode(204) @ApiNoContentResponse({ description: 'Ends this session' })
    logout(@Body() dto: RefreshDto) { return this.auth.logout(dto.refreshToken); }

    @AccountScope() @ApiBearerAuth() @Post("logout-all") @HttpCode(204)
    @ApiNoContentResponse({ description: 'Ends every session of this account, on all devices' })
    logoutAll(@CurrentUser() user: AuthUser) { return this.auth.revokeAll(user.id); }

    @AccountScope() @ApiBearerAuth() @SensitiveThrottle() @Patch("password")
    @ApiOkResponse({ type: AuthResponseDto, description: 'Other devices are signed out; use the returned tokens here' })
    @ApiUnauthorizedResponse({ type: ErrorResponseDto, description: 'Current password is wrong, or not signed in' })
    changePassword(@CurrentUser() user: AuthUser, @Body() dto: ChangePasswordDto) {
        return this.auth.changePassword(user.id, dto.currentPassword, dto.newPassword);
    }

    @AccountScope() @ApiBearerAuth() @Get("me") @ApiOkResponse({ type: MeDto })
    me(@CurrentUser() user: AuthUser) { return this.auth.me(user.id); }
}
