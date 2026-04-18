// src/modules/telephony/index.ts
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import twilio from 'twilio';
import { config } from '../../config';
import { findOrCreateCaller, createSession, getRecentSummary } from '../memory/callers';
import { saveCallState } from '../memory/redis';
import { buildWelcomeMessage, buildMenuMessage, getLanguageName } from '../../prompts';
import { synthesizeSpeech } from '../tts';
import { handleMediaStream } from '../media-bridge';
import type { CallState } from '../../types';

const VoiceResponse = twilio.twiml.VoiceResponse;

/**
 * Validate that the request actually came from Twilio.
 */
function validateTwilioRequest(req: FastifyRequest): boolean {
  const signature = req.headers['x-twilio-signature'] as string;
  if (!signature) return false;
  const url = `${config.publicUrl}${req.url}`;
  return twilio.validateRequest(
    config.twilio.authToken,
    signature,
    url,
    req.body as Record<string, string>
  );
}

export async function registerTelephonyRoutes(app: FastifyInstance): Promise<void> {

  // ── POST /twilio/voice — entry point for every incoming call ──
  app.post('/twilio/voice', async (req: FastifyRequest, reply: FastifyReply) => {
    // Uncomment in production:
    // if (!validateTwilioRequest(req)) return reply.code(403).send('Forbidden');

    const body = req.body as Record<string, string>;
    const callSid = body.CallSid;
    const fromNumber = body.From ?? 'unknown';

    console.log(`[Telephony] Incoming call: ${callSid} from ${fromNumber}`);

    // Look up or create caller profile
    const caller = await findOrCreateCaller(fromNumber);
    const recentSummary = caller.consent_memory ? await getRecentSummary(caller.id) : null;
    const isReturning = recentSummary !== null;

    // Create a session record
    const session = await createSession(caller.id, callSid, caller.preferred_mode, caller.default_language);

    // Build initial call state in Redis
    const state: CallState = {
      callSid,
      callerId: caller.id,
      sessionId: session.id,
      language: caller.default_language,
      mode: caller.preferred_mode,
      turnCount: 0,
      history: [],
      startedAt: Date.now(),
      nickname: caller.nickname,
      welcomed: false,
    };
    await saveCallState(callSid, state);

    // Build welcome TwiML
    const twiml = new VoiceResponse();
    const welcomeText = buildWelcomeMessage(isReturning, caller.nickname, recentSummary);

    // <Say> the welcome, then <Connect> to Media Stream for real-time audio
    twiml.say({ voice: 'Polly.Joanna', language: 'en-US' }, welcomeText);

    const connect = twiml.connect();
    connect.stream({
      url: `wss://${new URL(config.publicUrl).host}/twilio/stream`,
      // Send both inbound (caller) and outbound (AI) audio
      track: 'inbound_track',
    });

    reply.header('Content-Type', 'text/xml');
    return reply.send(twiml.toString());
  });

  // ── POST /twilio/status — call status callbacks ──────────────
  app.post('/twilio/status', async (req: FastifyRequest, reply: FastifyReply) => {
    const body = req.body as Record<string, string>;
    console.log(`[Telephony] Status: ${body.CallStatus} for ${body.CallSid}`);
    return reply.send('OK');
  });

  // ── POST /twilio/gather — DTMF menu (optional fallback) ──────
  app.post('/twilio/gather', async (req: FastifyRequest, reply: FastifyReply) => {
    const body = req.body as Record<string, string>;
    const digit = body.Digits;

    const twiml = new VoiceResponse();
    if (!digit) {
      twiml.say('I did not receive your input. Please try again.');
    } else {
      twiml.say(`You pressed ${digit}. Connecting you now.`);
    }

    // Redirect back to stream for actual AI conversation
    twiml.redirect('/twilio/voice');
    reply.header('Content-Type', 'text/xml');
    return reply.send(twiml.toString());
  });

  // ── WebSocket /twilio/stream — real-time media ───────────────
  app.get('/twilio/stream', { websocket: true }, (socket, req) => {
    console.log('[Telephony] Media stream WebSocket connected');
    handleMediaStream(socket as any);
  });
}
