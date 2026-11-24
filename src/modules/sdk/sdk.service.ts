import { Injectable, NotFoundException } from '@nestjs/common';
import openapiTS, { astToString, type OpenAPI3 } from 'openapi-typescript';
import { strToU8, zipSync } from 'fflate';
import { getOpenApiDocument } from './openapi-store.js';
import { CLIENT_TEMPLATE, INDEX_TEMPLATE, README_TEMPLATE } from './templates.js';

@Injectable()
export class SdkService {
  private cache: { filename: string; data: Uint8Array } | null = null;

  async buildTypescriptZip() {
    if (this.cache) return this.cache;

    const doc = getOpenApiDocument();
    if (!doc) throw new NotFoundException('API document not ready yet');

    // The generated file contains types only (no runtime code).
    const ast = await openapiTS(doc as unknown as OpenAPI3);
    const schema = astToString(ast);

    const data = zipSync({
      'schema.ts': strToU8(schema),
      'client.ts': strToU8(CLIENT_TEMPLATE),
      'index.ts': strToU8(INDEX_TEMPLATE),
      'README.md': strToU8(README_TEMPLATE),
    });

    this.cache = { filename: 'ovation-sdk-' + doc.info.version + '.zip', data };
    return this.cache;
  }
}