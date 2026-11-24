import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module.js';
import { ObserveInstrument } from './observe.js';
import { setOpenApiDocument } from './modules/sdk/openapi-store.js';

(BigInt.prototype as unknown as { toJSON: () => string }).toJSON = function (this: bigint) {
  return this.toString()
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { instrument: ObserveInstrument });
  app.enableShutdownHooks(); // lets Observe send its last telemetry when the process stops
  app.setGlobalPrefix('api');
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.enableCors(); // restrict to your frontend's URL before deploying

  const config = new DocumentBuilder()
    .setTitle('Ovation API')
    .setVersion('0.1.0')
    .addBearerAuth()
    .build();
  
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document, { jsonDocumentUrl: 'api/openapi.json' });
  setOpenApiDocument(document)

  await app.listen(process.env.PORT ?? 5000);
}

bootstrap();