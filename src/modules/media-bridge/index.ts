// src/modules/media-bridge/index.ts
import type { WebSocket } from 'ws';
import { transcribeAudio } from '../stt';
import { synthesizeSpeech } from '../tts';
import { orchestrate, generateSummary } from '../orchestrator';
import { getCallState, saveCallState, deleteCallState } from '../memory/redis';
import { saveTurn, endSession } from '../memory/callers';
import { sendFollowUpSms } from '../sms';
import { query } from '../../db';
import type { CallState } from '../../types';

// How many audio chunks to collect before sending to Whisper.
// Twilio sends 20ms chunks of mulaw. 100 chunks = ~2 seconds of audio.
// We collect until silence (no new audio for 500ms) OR maxChunks.
const MAX_CHUNKS = 200; // 4 seconds max utterance
const SILENCE_TIMEOUT_MS = 600; // 600ms silence = end of speech

interface StreamMessage {
  event: string;
  sequenceNumber?: string;
  media?: { payload: string; track: string; timestamp: string; chunk: string };
  start?: { callSid: string; streamSid: string; accountSid: string };
  stop?: { callSid: string; accountSid: string };
  dtmf?: { digit: string };
}

/**
 * Handle a Twilio Media Stream WebSocket connection.
 * One WebSocket connection = one phone call.
 */
export async function handleMediaStream(ws: WebSocket): Promise<void> {
  let callSid: string | null = null;
  let streamSid: string | null = null;
  let audioChunks: Buffer[] = [];
  let silenceTimer: NodeJS.Timeout | null = null;
  let isProcessing = false; // prevent overlapping STT calls

  ws.on('message', async (raw: Buffer) => {
    let msg: StreamMessage;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return;
    }

    switch (msg.event) {
      case 'start': {
        callSid = msg.start!.callSid;
        streamSid = msg.start!.streamSid;
        console.log(`[Bridge] Stream started: ${callSid}`);
        break;
      }

      case 'media': {
        if (!callSid || isProcessing) return;
        if (msg.media?.track !== 'inbound') return; // only process caller audio

        const chunk = Buffer.from(msg.media.payload, 'base64');
        audioChunks.push(chunk);

        // Reset silence timer on every new chunk
        if (silenceTimer) clearTimeout(silenceTimer);
        silenceTimer = setTimeout(() => {
          processUtterance(audioChunks.splice(0));
        }, SILENCE_TIMEOUT_MS);

        // Hard max — don't wait forever
        if (audioChunks.length >= MAX_CHUNKS) {
          if (silenceTimer) clearTimeout(silenceTimer);
          processUtterance(audioChunks.splice(0));
        }
        break;
      }

      case 'dtmf': {
        if (!callSid || !msg.dtmf?.digit) return;
        const digit = msg.dtmf.digit;
        console.log(`[Bridge] DTMF: ${digit}`);
        await handleInput(digit, 'en', true);
        break;
      }

      case 'stop': {
        console.log(`[Bridge] Stream stopped: ${callSid}`);
        await handleCallEnd();
        break;
      }
    }
  });

  ws.on('close', async () => {
    if (callSid) await handleCallEnd();
  });

  ws.on('error', (err) => {
    console.error('[Bridge] WebSocket error:', err.message);
  });

  // ── Process collected audio ──────────────────────────────────
  async function processUtterance(chunks: Buffer[]): Promise<void> {
    if (!callSid || chunks.length < 5) return; // too short, skip
    if (isProcessing) return;
    isProcessing = true;

    try {
      const audioBuffer = Buffer.concat(chunks);
      const state = await getCallState(callSid!);
      if (!state) { isProcessing = false; return; }

      // Transcribe
      const sttResult = await transcribeAudio(audioBuffer, state.language === 'auto' ? undefined : state.language);
      const text = sttResult.text.trim();

      console.log(`[Bridge] STT [${sttResult.language}]: "${text}" (conf: ${sttResult.confidence.toFixed(2)})`);

      if (!text || sttResult.confidence < 0.2) {
        // Too low confidence — play fallback
        await speakAndSend('Sorry, I did not catch that. Could you repeat that slowly?', state.language);
        isProcessing = false;
        return;
      }

      // Save caller turn
      await saveTurn(state.sessionId, 'caller', text, sttResult.language, sttResult.durationMs);

      // Orchestrate
      const result = await orchestrate(text, state, sttResult.language);

      // Save AI turn
      await saveTurn(state.sessionId, 'ai', result.reply, result.updatedState.language, result.latencyMs);

      // Update state in Redis
      await saveCallState(callSid!, result.updatedState);

      // Speak response back
      await speakAndSend(result.reply, result.updatedState.language);

    } catch (err: any) {
      console.error('[Bridge] processUtterance error:', err.message);
    } finally {
      isProcessing = false;
    }
  }

  // ── Handle DTMF input ─────────────────────────────────────────
  async function handleInput(input: string, detectedLang: string, isDtmf = false): Promise<void> {
    if (!callSid) return;
    const state = await getCallState(callSid);
    if (!state) return;

    const result = await orchestrate(input, state, detectedLang);
    await saveCallState(callSid, result.updatedState);
    await speakAndSend(result.reply, result.updatedState.language);
  }

  // ── Convert text → mulaw and stream back into call ───────────
  async function speakAndSend(text: string, language: string): Promise<void> {
    if (!streamSid || ws.readyState !== ws.OPEN) return;
    try {
      const audioBuffer = await synthesizeSpeech(text, language);
      if (!audioBuffer.length) return;

      // Twilio expects base64-encoded mulaw in 160-byte chunks (20ms at 8kHz)
      const CHUNK_SIZE = 160;
      for (let i = 0; i < audioBuffer.length; i += CHUNK_SIZE) {
        const chunk = audioBuffer.slice(i, i + CHUNK_SIZE);
        const payload = chunk.toString('base64');
        ws.send(JSON.stringify({
          event: 'media',
          streamSid,
          media: { payload },
        }));
      }

      // Send a mark event so we know when playback finished
      ws.send(JSON.stringify({
        event: 'mark',
        streamSid,
        mark: { name: 'ai-response-end' },
      }));
    } catch (err: any) {
      console.error('[Bridge] speakAndSend error:', err.message);
    }
  }

  // ── End-of-call cleanup ───────────────────────────────────────
  async function handleCallEnd(): Promise<void> {
    if (!callSid) return;
    const state = await getCallState(callSid);
    if (!state) return;

    try {
      const durationSeconds = Math.round((Date.now() - state.startedAt) / 1000);
      const summary = await generateSummary(state.history, state.language);
      await endSession(callSid, summary, durationSeconds);

      // Send SMS if caller opted in and call was meaningful
      if (durationSeconds > 30) {
        const [callerRow] = await query(
          'SELECT phone_number, consent_sms FROM callers WHERE id = $1',
          [state.callerId]
        );
        if (callerRow?.consent_sms) {
          // Get session id
          const [sess] = await query('SELECT id FROM sessions WHERE call_sid = $1', [callSid]);
          if (sess) {
            await sendFollowUpSms(callerRow.phone_number, state.callerId, sess.id, summary, state);
          }
        }
      }
    } catch (err: any) {
      console.error('[Bridge] handleCallEnd error:', err.message);
    } finally {
      await deleteCallState(callSid);
      callSid = null;
    }
  }
}
