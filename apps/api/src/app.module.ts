import { DynamicModule, Module } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { LoggerModule } from 'nestjs-pino';
import { API_ENV, type ApiEnv } from './config/env';
import { HealthModule } from './health/health.module';
import { InfraModule } from './infra/infra.module';

const REQUEST_ID = /^[A-Za-z0-9._-]{8,128}$/;

@Module({})
export class AppModule {
  static register(env: ApiEnv): DynamicModule {
    return {
      module: AppModule,
      global: true,
      imports: [
        LoggerModule.forRoot({
          pinoHttp: {
            level: env.LOG_LEVEL,
            // Accept a well-formed caller id for correlation, otherwise mint one.
            genReqId: (req, res) => {
              const incoming = req.headers['x-request-id'];
              const id = typeof incoming === 'string' && REQUEST_ID.test(incoming) ? incoming : randomUUID();
              res.setHeader('x-request-id', id);
              return id;
            },
            redact: {
              paths: ['req.headers.authorization', 'req.headers.cookie', 'res.headers["set-cookie"]'],
              censor: '[redacted]',
            },
            autoLogging: { ignore: (req) => (req.url ?? '').startsWith('/api/v1/health/') },
          },
        }),
        InfraModule,
        HealthModule,
      ],
      providers: [{ provide: API_ENV, useValue: env }],
      exports: [API_ENV],
    };
  }
}
