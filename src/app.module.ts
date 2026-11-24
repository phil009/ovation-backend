import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { APP_GUARD } from "@nestjs/core";
import { ObserveModule } from "./observe.js";
import { PrismaModule } from "./prisma/prisma.module.js";
import { UsersModule } from "./modules/users/users.module.js";
import { AuthModule } from "./modules/auth/auth.module.js";
import { EventsModule } from "./modules/events/events.module.js";
import { AwardeesModule } from "./modules/awardees/awardees.module.js";
import { DonationsModule } from "./modules/donations/donations.module.js";
import { ReportsModule } from "./modules/reports/reports.module.js";
import { SdkModule } from "./modules/sdk/sdk.module.js";
import { AuditModule } from "./modules/audit/audit.module.js";
import { JwtAuthGuard } from "./modules/auth/jwt-auth-guard.js";
import { RolesGuard } from "./modules/auth/roles.guard.js";

@Module({
    imports: [
        // First, so it shuts down last and sends everything still buffered.
        ObserveModule.forRoot({
            serviceId: "ovation-api",
            // Set OBSERVE_ENABLED=false to stop a machine from reporting (e.g. local dev).
            enabled: process.env.OBSERVE_ENABLED !== "false",
            // Tag each trace with the logged-in user's id (set by JwtStrategy), never their email.
            http: { getUserId: (req: { user?: { id?: string } }) => req.user?.id ?? "" },
        }),
        ConfigModule.forRoot({ isGlobal: true }),
        PrismaModule,
        UsersModule,
        AuthModule,
        EventsModule,
        AwardeesModule,
        DonationsModule,
        ReportsModule,
        SdkModule,
        AuditModule,
    ],
    providers: [
        // Order matters: who are you (JWT), then are you allowed (roles).
        { provide: APP_GUARD, useClass: JwtAuthGuard },
        { provide: APP_GUARD, useClass: RolesGuard },
    ],
})
export class AppModule { }
