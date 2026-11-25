import { INestApplication, VersioningType } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule, type OpenAPIObject } from '@nestjs/swagger';
import helmet from 'helmet';
import type { JWTVerifyGetKey } from 'jose';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { ProblemDetailsFilter } from './common/problem-details.filter';
import type { ApiEnv } from './config/env';
import { ProblemDetailsDto } from './health/health.dto';
import { APP_VERSION } from './version';

export async function createApp(
  env: ApiEnv,
  opts: { bufferLogs?: boolean; keyResolver?: JWTVerifyGetKey } = {},
): Promise<INestApplication> {
  const app = await NestFactory.create(AppModule.register(env, { keyResolver: opts.keyResolver }), {
    bufferLogs: opts.bufferLogs ?? true,
  });
  app.useLogger(app.get(Logger));
  app.use(helmet());
  app.enableCors({
    origin: env.API_CORS_ORIGINS,
    credentials: true,
    allowedHeaders: ['Authorization', 'Content-Type', 'Idempotency-Key', 'Accept-Language', 'X-Request-Id'],
    exposedHeaders: ['X-Request-Id', 'Idempotent-Replayed'],
  });
  app.setGlobalPrefix('api');
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
  app.useGlobalFilters(new ProblemDetailsFilter());
  app.enableShutdownHooks();
  return app;
}

export function buildOpenApi(app: INestApplication): OpenAPIObject {
  const config = new DocumentBuilder()
    .setTitle('Automotive ERP API')
    .setDescription('REST /api/v1. Errors use RFC 9457 application/problem+json.')
    .setVersion(APP_VERSION.replace(/-dev$/, ''))
    .addBearerAuth()
    .build();
  return SwaggerModule.createDocument(app, config, { extraModels: [ProblemDetailsDto] });
}
