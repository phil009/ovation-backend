import { Module } from '@nestjs/common';
import { AuditController } from './audit.controller.js';
import { AuditService } from './audit.service.js';

@Module({
  controllers: [AuditController],
  providers: [AuditService],
  exports: [AuditService], // used by the events, awardees and donations services
})
export class AuditModule {}
