import 'reflect-metadata';
import { SwaggerModule } from '@nestjs/swagger';
import { buildOpenApi, createApp } from './bootstrap';
import { loadApiEnv } from './config/env';

async function main(): Promise<void> {
  const env = loadApiEnv();
  const app = await createApp(env);
  if (env.NODE_ENV !== 'production') SwaggerModule.setup('api/docs', app, buildOpenApi(app));
  await app.listen(env.API_PORT);
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
