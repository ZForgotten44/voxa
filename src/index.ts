// src/index.ts
import Fastify from 'fastify';
import fastifyWebsocket from '@fastify/websocket';
import fastifyFormBody from '@fastify/formbody';
import { db } from './db';
import { redis } from './modules/memory/redis';
import { registerTelephonyRoutes } from './modules/telephony';

const app = Fastify({ logger: { level: 'info' } });

async function start() {
  await app.register(fastifyFormBody);
  await app.register(fastifyWebsocket);

  // Health check responds immediately — before DB is ready
  app.get('/health', async () => ({ status: 'ok', time: new Date().toISOString() }));

  await registerTelephonyRoutes(app);

  const port = Number(process.env.PORT) || 3000;
  await app.listen({ port, host: '0.0.0.0' });
  console.log(`Server running on port ${port}`);

  // Connect AFTER server is live so health check passes first
  db.connect()
    .then(() => console.log('✓ Postgres connected'))
    .catch(err => console.error('✗ Postgres failed:', err.message));

  redis.connect()
    .then(() => console.log('✓ Redis connected'))
    .catch(err => console.error('✗ Redis failed:', err.message));
}

start().catch(err => { console.error(err); process.exit(1); });
