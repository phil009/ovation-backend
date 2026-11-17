import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { PrismaModule } from "./prisma/prisma.module.js";
import { UsersModule } from "./modules/users/users.module.js";
import { AuthModule } from "./modules/auth/auth.module.js";
import { APP_GUARD } from "@nestjs/core";
import { JwtAuthGuard } from "./modules/auth/jwt-auth-guard.js";
import { RolesGuard } from "./modules/auth/roles.guard.js";

@Module({
    imports: [ConfigModule.forRoot({ isGlobal: true }), PrismaModule, UsersModule, AuthModule],
    providers: [
        { provide: APP_GUARD, useClass: JwtAuthGuard },
        { provide: APP_GUARD, useClass: RolesGuard }
    ]
})

export class AppModule{ }
