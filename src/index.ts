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
  // plugins
  await app.register(fastifyFormBody);
  await app.register(fastifyWebsocket);

  // health route
  app.get('/health', async () => ({
    status: 'ok',
    time: new Date().toISOString(),
  }));

  // routes
  await registerTelephonyRoutes(app);

  // 🚀 START SERVER FIRST (important)
  const port = Number(process.env.PORT) || config.port || 3000;

  await app.listen({ port, host: '0.0.0.0' });

  console.log(`🌍 Running on port ${port}`);

  // connect services AFTER server is live
  db.connect()
    .then(() => console.log('✓ Postgres connected'))
    .catch(err => console.error('Postgres failed:', err));

  redis.connect()
    .then(() => console.log('✓ Redis connected'))
    .catch(err => console.error('Redis failed:', err));
}

// start app
start().catch(err => {
  console.error('Fatal startup error:', err);
  process.exit(1);
});
