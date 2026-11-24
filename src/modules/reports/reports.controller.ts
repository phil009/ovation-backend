import { Controller, Get, Param, ParseUUIDPipe } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { ReportsService } from './reports.service.js';
import { EventSummaryDto } from './dto/event-summary.dto.js';

@ApiTags('reports')
@ApiBearerAuth()
@Controller('events/:eventId')
export class ReportsController {
  constructor(private reports: ReportsService) {}

  @Get('summary') @ApiOkResponse({ type: EventSummaryDto })
  summary(@Param('eventId', ParseUUIDPipe) eventId: string) {
    return this.reports.eventSummary(eventId);
  }
}
