import Fastify from 'fastify';
import fastifyWebsocket from '@fastify/websocket';
import fastifyFormBody from '@fastify/formbody';

const app = Fastify({ logger: { level: 'info' } });

async function start() {
  await app.register(fastifyFormBody);
  await app.register(fastifyWebsocket);

  app.get('/health', async () => ({ status: 'ok' }));

  app.post('/twilio/voice', async (_request, reply) => {
    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="alice">Hello. Your Railway deployment works. Twilio is now connected.</Say>
</Response>`;

    reply
      .type('text/xml')
      .send(twiml);
  });

  const port = Number(process.env.PORT) || 3000;
  await app.listen({ port, host: '0.0.0.0' });
  console.log(`Server running on port ${port}`);
}

start().catch(err => {
  console.error(err);
  process.exit(1);
});
