import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { APP_GUARD } from "@nestjs/core";
import { PrismaModule } from "./prisma/prisma.module.js";
import { UsersModule } from "./modules/users/users.module.js";
import { AuthModule } from "./modules/auth/auth.module.js";
import { EventsModule } from "./modules/events/events.module.js";
import { AwardeesModule } from "./modules/awardees/awardees.module.js";
import { DonationsModule } from "./modules/donations/donations.module.js";
import { ReportsModule } from "./modules/reports/reports.module.js";
import { SdkModule } from "./modules/sdk/sdk.module.js";
import { JwtAuthGuard } from "./modules/auth/jwt-auth-guard.js";
import { RolesGuard } from "./modules/auth/roles.guard.js";

@Module({
    imports: [
        ConfigModule.forRoot({ isGlobal: true }),
        PrismaModule,
        UsersModule,
        AuthModule,
        EventsModule,
        AwardeesModule,
        DonationsModule,
        ReportsModule,
        SdkModule,
    ],
    providers: [
        // Order matters: who are you (JWT), then are you allowed (roles).
        { provide: APP_GUARD, useClass: JwtAuthGuard },
        { provide: APP_GUARD, useClass: RolesGuard },
    ],
})
export class AppModule { }
