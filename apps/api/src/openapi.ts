// Writes the OpenAPI document without listening or touching the database. Dependency URLs are
// placeholders: clients connect lazily and nothing is queried while the document is built.
import 'reflect-metadata';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildOpenApi, createApp } from './bootstrap';
import { loadApiEnv } from './config/env';

async function main(): Promise<void> {
  const out = process.argv[2];
  if (!out) throw new Error('usage: node dist/openapi.js <output.json>');
  const env = loadApiEnv({
    NODE_ENV: 'test',
    LOG_LEVEL: 'error',
    DATABASE_URL: 'postgresql://openapi@127.0.0.1:1/openapi',
    REDIS_CACHE_URL: 'redis://127.0.0.1:1',
    REDIS_QUEUE_URL: 'redis://127.0.0.1:1',
  });
  const app = await createApp(env, { bufferLogs: false });
  const doc = buildOpenApi(app);
  await app.close();
  writeFileSync(resolve(out), `${JSON.stringify(doc, null, 2)}\n`);
  console.warn(`OpenAPI written to ${resolve(out)}`);
}

main().then(
  () => process.exit(0),
  (err: unknown) => {
    console.error(err);
    process.exit(1);
  },
);
