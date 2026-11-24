import { Module } from '@nestjs/common';
import { EventsModule } from '../events/events.module.js';
import { AwardeesModule } from '../awardees/awardees.module.js';
import { AuditModule } from '../audit/audit.module.js';
import { DonationsController } from './donations.controller.js';
import { DonationsService } from './donations.service.js';

@Module({
  imports: [EventsModule, AwardeesModule, AuditModule],
  controllers: [DonationsController],
  providers: [DonationsService],
})
export class DonationsModule {}
