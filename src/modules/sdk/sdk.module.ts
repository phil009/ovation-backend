import { Module } from '@nestjs/common';
import { SdkController } from './sdk.controller.js';
import { SdkService } from './sdk.service.js';

@Module({ controllers: [SdkController], providers: [SdkService] })
export class SdkModule {}