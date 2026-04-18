// src/index.ts
import Fastify from 'fastify';
import fastifyWebsocket from '@fastify/websocket';
import fastifyFormBody from '@fastify/formbody';
import { config } from './config';
import { db } from './db';
import { redis } from './modules/memory/redis';
import { registerTelephonyRoutes } from './modules/telephony';

const app = Fastify({
  logger: {
    level: 'info',
    transport: { target: 'pino-pretty', options: { colorize: true } },
  },
});

async function start() {
  // ── Plugins ───────────────────────────────────────────────────
  await app.register(fastifyFormBody);   // parse Twilio form POSTs
  await app.register(fastifyWebsocket);  // WebSocket support

  // ── Health check ──────────────────────────────────────────────
  app.get('/health', async () => ({
    status: 'ok',
    time: new Date().toISOString(),
    version: '1.0.0',
  }));

  // ── Telephony routes ──────────────────────────────────────────
  await registerTelephonyRoutes(app);

const port = Number(process.env.PORT) || config.port || 3000;

await app.listen({ port, host: '0.0.0.0' });

console.log(`🌍 Running on port ${port}`);

// connect async AFTER server is live
db.connect()
  .then(() => console.log('✓ Postgres connected'))
  .catch(err => console.error('Postgres failed:', err));

redis.connect()
  .then(() => console.log('✓ Redis connected'))
  .catch(err => console.error('Redis failed:', err));
  
start().catch(err => {
  console.error('Fatal startup error:', err);
  process.exit(1);
});
