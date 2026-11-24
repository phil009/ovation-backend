import { Module } from '@nestjs/common';
import { EventsModule } from '../events/events.module.js';
import { ReportsController } from './reports.controller.js';
import { ReportsService } from './reports.service.js';
import { ExportService } from './export.service.js';

@Module({
  imports: [EventsModule],
  controllers: [ReportsController],
  providers: [ReportsService, ExportService],
})
export class ReportsModule {}
