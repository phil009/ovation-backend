import { Controller, Get, NotFoundException, StreamableFile } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiExcludeController } from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator.js';
import { SdkService } from './sdk.service.js';

@ApiExcludeController()
@Controller('sdk')
export class SdkController {
  constructor(private sdk: SdkService, private config: ConfigService) {}

  @Public()
  @Get('typescript.zip')
  async typescript() {
    if (this.config.get('SDK_DOWNLOAD_ENABLED') === 'false') throw new NotFoundException();
    const { filename, data } = await this.sdk.buildTypescriptZip();
    return new StreamableFile(data, {
      type: 'application/zip',
      disposition: 'attachment; filename="' + filename + '"',
    });
  }
}