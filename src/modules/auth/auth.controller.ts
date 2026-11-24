import { Body, Controller, Get, Post } from "@nestjs/common";
import { AuthService } from "./auth.service.js";
import { Public } from "../../common/decorators/public.decorator.js";
import { LoginDto } from "./dto/login.dto.js";
import { RefreshDto } from "./dto/refresh.dto.js";
import { CurrentUser } from "../../common/decorators/current-user.decorator.js";
import { ApiBearerAuth, ApiCreatedResponse, ApiOkResponse, ApiTags } from "@nestjs/swagger";
import { AuthResponseDto, MeDto } from "./dto/auth-response.dto.js";

@ApiTags('auth')
@Controller("auth")
export class AuthController {
    constructor(private auth: AuthService) { }
    
    @Public() @Post("login") @ApiCreatedResponse({ type: AuthResponseDto })
    login(@Body() dto: LoginDto) { return this.auth.login(dto.email, dto.password); }

    @Public() @Post("refresh") @ApiCreatedResponse({ type: AuthResponseDto })
    refresh(@Body() dto: RefreshDto) { return this.auth.refresh(dto.refreshToken); }

    @Get("me") @ApiBearerAuth() @ApiOkResponse({ type: MeDto })
    me(@CurrentUser() user: unknown) { return user; }
}
