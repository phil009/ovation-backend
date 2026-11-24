import { Module } from "@nestjs/common";
import { PassportModule } from "@nestjs/passport";
import { JwtModule } from "@nestjs/jwt";
import { AuthController } from "./auth.controller.js";
import { AuthService } from "./auth.service.js";
import { JwtStrategy } from "./jwt.strategy.js";

@Module({
    imports: [PassportModule, JwtModule.register({})],
    controllers: [AuthController],
    providers: [AuthService, JwtStrategy],
})
export class AuthModule { }
