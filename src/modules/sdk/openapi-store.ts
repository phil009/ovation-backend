import type { OpenAPIObject } from '@nestjs/swagger';

let document: OpenAPIObject | null = null;
export const setOpenApiDocument = (d: OpenAPIObject) => { document = d; };
export const getOpenApiDocument = () => document;