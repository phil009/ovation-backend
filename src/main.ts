import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { AppModule } from './app.module.js';
import { ObserveInstrument } from './observe.js';
import { setOpenApiDocument } from './modules/sdk/openapi-store.js';

// JSON can't carry BigInt: send kobo amounts as digit strings.
(BigInt.prototype as unknown as { toJSON: () => string }).toJSON = function (this: bigint) {
  return this.toString();
};

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { instrument: ObserveInstrument });
  const config = app.get(ConfigService);
  app.enableShutdownHooks(); // lets Observe send its last telemetry when the process stops

  // Behind a proxy (Render, Fly, nginx...) the client IP comes from X-Forwarded-For; rate limits need it.
  const trustProxy = config.get<string>('TRUST_PROXY');
  if (trustProxy) app.set('trust proxy', /^\d+$/.test(trustProxy) ? Number(trustProxy) : trustProxy === 'true' ? true : trustProxy);

  // Security headers (no sniffing, no framing, HSTS...).
  app.use(helmet());

  // Only the listed frontend origins may call the API from a browser. In development, any origin.
  const origins = config.get<string>('CORS_ORIGINS')?.split(',').map((o) => o.trim()).filter(Boolean);
  app.enableCors({ origin: origins && origins.length > 0 ? origins : true });

  app.setGlobalPrefix('api');
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

  const document = SwaggerModule.createDocument(
    app,
    new DocumentBuilder().setTitle('Ovation API').setVersion('0.2.0').addBearerAuth().build(),
  );
  // The document is always built (the SDK download uses it); the public docs pages can be switched off.
  if (config.get<string>('DOCS_ENABLED') !== 'false') {
    SwaggerModule.setup('api/docs', app, document, { jsonDocumentUrl: 'api/openapi.json' });
  }
  setOpenApiDocument(document);

  await app.listen(config.getOrThrow<number>('PORT'));
}

bootstrap();
