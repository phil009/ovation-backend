import { Module } from '@nestjs/common';
import { EventsModule } from '../events/events.module.js';
import { AuditModule } from '../audit/audit.module.js';
import { AwardeesController } from './awardees.controller.js';
import { AwardeesService } from './awardees.service.js';

@Module({
  imports: [EventsModule, AuditModule],
  controllers: [AwardeesController],
  providers: [AwardeesService],
  exports: [AwardeesService],
})
export class AwardeesModule {}
