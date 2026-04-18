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
  },
});

async function start() {
  await app.register(fastifyFormBody);
  await app.register(fastifyWebsocket);

  app.get('/health', async () => {
    return { status: 'ok' };
  });

  await registerTelephonyRoutes(app);

  const port = Number(process.env.PORT) || 3000;

  await app.listen({ port, host: '0.0.0.0' });

  console.log(`Server running on port ${port}`);

  // connect async after server is live
  db.connect()
    .then(() => console.log('Postgres connected'))
    .catch(err => console.error('Postgres failed:', err));

  redis.connect()
    .then(() => console.log('Redis connected'))
    .catch(err => console.error('Redis failed:', err));
}

start().catch(err => {
  console.error(err);
  process.exit(1);
});
