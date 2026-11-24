import { Controller, Get, Param, ParseUUIDPipe, StreamableFile } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiProduces, ApiTags } from '@nestjs/swagger';
import { Role } from '../../generated/prisma/enums.js';
import { From, OrgAccess } from '../../common/access/org-access.decorator.js';
import { ReportsService } from './reports.service.js';
import { ExportService } from './export.service.js';
import { EventSummaryDto } from './dto/event-summary.dto.js';

const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

@ApiTags('reports')
@ApiBearerAuth()
@Controller('events/:eventId')
export class ReportsController {
  constructor(private reports: ReportsService, private exporter: ExportService) {}

  @OrgAccess(Role.VIEWER, From.eventParam('eventId')) @Get('summary') @ApiOkResponse({ type: EventSummaryDto })
  summary(@Param('eventId', ParseUUIDPipe) eventId: string) {
    return this.reports.eventSummary(eventId);
  }

  /** Excel workbook in the client's notebook layout. In the SDK, call it with parseAs: 'blob'. */
  @OrgAccess(Role.VIEWER, From.eventParam('eventId')) @Get('export.xlsx')
  @ApiProduces(XLSX) @ApiOkResponse({ description: 'Excel workbook', schema: { type: 'string', format: 'binary' } })
  async export(@Param('eventId', ParseUUIDPipe) eventId: string) {
    const { buffer, filename } = await this.exporter.eventWorkbook(eventId);
    return new StreamableFile(buffer, { type: XLSX, disposition: `attachment; filename="${filename}"` });
  }
}
