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

  // ── Connect to DB and Redis ───────────────────────────────────
  await db.connect();
  console.log('✓ Postgres connected');

  await redis.connect();
  console.log('✓ Redis connected');

  // ── Start server ──────────────────────────────────────────────
  const port = Number(process.env.PORT) || config.port || 3000;
  await app.listen({ port, host: '0.0.0.0' });
  console.log(`\n🌍 Running on port ${port}`);
  console.log(`   Twilio voice webhook: ${config.publicUrl}/twilio/voice`);
  console.log(`   Media stream:         wss://${new URL(config.publicUrl).host}/twilio/stream`);
  console.log(`   Health check:         ${config.publicUrl}/health\n`);
}

start().catch(err => {
  console.error('Fatal startup error:', err);
  process.exit(1);
});
